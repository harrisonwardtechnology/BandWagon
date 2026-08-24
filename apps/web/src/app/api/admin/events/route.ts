import { requirePlatformRole } from "@/lib/auth";
import { listOrganizationsForAdministrator, requireOrganizationAdmin } from "@/lib/admin-access";
import {
  assignActiveGoogleConnectionToOrganization,
  createManualEvent,
  listOrganizationEvents,
  normalizeImportedCalendarEvents,
} from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const organizations = await listOrganizationsForAdministrator();
    if (organizationId) await requireOrganizationAdmin(organizationId, { write: false });
    const events = organizationId ? await listOrganizationEvents(organizationId) : [];
    return Response.json({ organizations, events });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Event administrator access is required" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "bind-google") {
      if (!body.organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });
      await requireOrganizationAdmin(String(body.organizationId));
      return Response.json({ ok: true, connection: await assignActiveGoogleConnectionToOrganization(String(body.organizationId)) });
    }

    if (body.action === "normalize") {
      await requirePlatformRole(["owner"]);
      return Response.json({ ok: true, ...(await normalizeImportedCalendarEvents()) });
    }

    if (body.action === "create-manual") {
      if (!body.organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });
      await requireOrganizationAdmin(String(body.organizationId));
      const event = await createManualEvent({
        organizationId: String(body.organizationId),
        title: String(body.title || ""),
        description: typeof body.description === "string" ? body.description : null,
        locationName: typeof body.locationName === "string" ? body.locationName : null,
        locationAddress: typeof body.locationAddress === "string" ? body.locationAddress : null,
        startsAt: typeof body.startsAt === "string" ? body.startsAt : null,
        endsAt: typeof body.endsAt === "string" ? body.endsAt : null,
        allDay: Boolean(body.allDay),
        visibility: ["organization","group","private"].includes(body.visibility) ? body.visibility : "organization",
        rideCoordinationEnabled: body.rideCoordinationEnabled !== false,
      });
      return Response.json({ ok: true, event });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Event operation failed" }, { status: 403 });
  }
}
