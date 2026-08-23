import { requireAdminTestToken } from "@/lib/admin-test";
import {
  assignActiveGoogleConnectionToOrganization,
  createManualEvent,
  listOrganizationEvents,
  listOrganizationsForEventAdmin,
  normalizeImportedCalendarEvents,
} from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const organizations = await listOrganizationsForEventAdmin();
  const events = organizationId ? await listOrganizationEvents(organizationId) : [];
  return Response.json({ organizations, events });
}

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "bind-google") {
      if (!body.organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });
      return Response.json({ ok: true, connection: await assignActiveGoogleConnectionToOrganization(String(body.organizationId)) });
    }

    if (body.action === "normalize") {
      return Response.json({ ok: true, ...(await normalizeImportedCalendarEvents()) });
    }

    if (body.action === "create-manual") {
      if (!body.organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });
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
    return Response.json({ error: error instanceof Error ? error.message : "Event operation failed" }, { status: 500 });
  }
}
