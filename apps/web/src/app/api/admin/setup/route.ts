import { requireSessionIdentity } from "@/lib/auth";
import { listOrganizationsForAdministrator } from "@/lib/admin-access";
import { createSetupJoinCode, getSetupChecklist, setManualSetupItem } from "@/lib/organization-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

function status(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Authentication required") return 401;
  if (/access is required|read-only|denied/.test(message)) return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizations = await listOrganizationsForAdministrator();
    const requested = new URL(request.url).searchParams.get("organizationId");
    const organizationId = requested || (organizations.length === 1 ? organizations[0].id : "");
    const checklist = organizationId ? await getSetupChecklist(identity, organizationId) : null;
    return Response.json({ ok: true, organizations, organizationId: organizationId || null, checklist }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load setup checklist" }, { status: status(error), headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body.organizationId || "");
    if (body.action === "mark") {
      await setManualSetupItem(identity, { organizationId, itemKey: String(body.itemKey || ""), done: body.done === true });
      return Response.json({ ok: true, checklist: await getSetupChecklist(identity, organizationId) }, { headers: privateHeaders });
    }
    if (body.action === "create_join_code") {
      const result = await createSetupJoinCode(identity, { organizationId, label: typeof body.label === "string" ? body.label : null });
      return Response.json({ ok: true, code: result.code, checklist: await getSetupChecklist(identity, organizationId) }, { headers: privateHeaders });
    }
    return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Setup update failed" }, { status: status(error), headers: privateHeaders });
  }
}
