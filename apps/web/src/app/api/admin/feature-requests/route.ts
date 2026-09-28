import { requirePlatformRole } from "@/lib/auth";
import { FEATURE_REQUEST_CATEGORIES, FEATURE_REQUEST_SORTS, FEATURE_REQUEST_STATUSES, allowedNextStatuses, normalizeSort } from "@/lib/feature-request-policy";
import { listFeatureRequestsForAdmin, updateFeatureRequestStatus } from "@/lib/feature-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner", "support"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform administrator access is required" }, { status: 403, headers: privateHeaders }); }
  try {
    const url = new URL(request.url);
    const requests = await listFeatureRequestsForAdmin({ status: url.searchParams.get("status"), category: url.searchParams.get("category"), sort: normalizeSort(url.searchParams.get("sort")) });
    return Response.json({
      requests: requests.map((row: any) => ({ ...row, next_statuses: allowedNextStatuses(row.status) })),
      statuses: FEATURE_REQUEST_STATUSES,
      categories: FEATURE_REQUEST_CATEGORIES,
      sorts: FEATURE_REQUEST_SORTS,
    }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load ideas" }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  let identity;
  try { identity = await requirePlatformRole(["owner", "support"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform administrator access is required" }, { status: 403, headers: privateHeaders }); }
  const body = await request.json().catch(() => ({}));
  try {
    const result = await updateFeatureRequestStatus(identity, {
      requestId: String(body.requestId || ""),
      status: String(body.status || ""),
      publicNote: typeof body.publicNote === "string" ? body.publicNote : undefined,
      duplicateOfId: typeof body.duplicateOfId === "string" ? body.duplicateOfId : null,
    });
    return Response.json({ ok: true, ...result }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the idea" }, { status: 400, headers: privateHeaders });
  }
}
