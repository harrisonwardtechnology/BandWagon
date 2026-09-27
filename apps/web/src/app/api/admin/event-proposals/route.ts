import { NextResponse } from "next/server";
import { listOrganizationsForAdministrator, requireOrganizationAdmin } from "@/lib/admin-access";
import {
  getEventProposalSettings,
  listEventProposalsForModeration,
  moderateEventProposal,
  updateEventProposalSettings,
} from "@/lib/event-proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const organizations = await listOrganizationsForAdministrator();
    if (!organizationId) return NextResponse.json({ ok: true, organizations, settings: null, proposals: [] }, privateResponse);
    const access = await requireOrganizationAdmin(organizationId, { write: false });
    const [settings, proposals] = await Promise.all([
      getEventProposalSettings(organizationId),
      listEventProposalsForModeration(organizationId, url.searchParams.get("status") || "open"),
    ]);
    return NextResponse.json({ ok: true, organizations, settings, proposals, role: access.organizationRole, platformAccess: access.platformAccess }, privateResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization administrator access is required" }, { status: 403, ...privateResponse });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const organizationId = String(body.organizationId || "");
  if (!organizationId) return NextResponse.json({ error: "Choose an organization" }, { status: 400, ...privateResponse });
  let access;
  try {
    access = await requireOrganizationAdmin(organizationId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization administrator access is required" }, { status: 403, ...privateResponse });
  }
  try {
    if (body.action === "update-settings") {
      const settings = await updateEventProposalSettings({
        organizationId,
        enabled: body.enabled === true,
        proposerScope: body.proposerScope,
        actorPersonId: access.identity.personId,
        organizationRole: access.organizationRole,
        platformAccess: access.platformAccess,
      });
      return NextResponse.json({ ok: true, settings }, privateResponse);
    }
    if (body.action === "approve" || body.action === "request-changes" || body.action === "decline") {
      const edits = body.edits && typeof body.edits === "object" ? body.edits : {};
      const result = await moderateEventProposal({
        identity: access.identity,
        organizationRole: access.organizationRole,
        platformAccess: access.platformAccess,
        organizationId,
        proposalId: String(body.proposalId || ""),
        action: body.action === "request-changes" ? "request_changes" : body.action,
        note: body.note,
        edits: {
          title: edits.title,
          description: edits.description,
          locationName: edits.locationName,
          locationAddress: edits.locationAddress,
          startsAt: edits.startsAt,
          endsAt: edits.endsAt,
          allDay: edits.allDay,
        },
        visibility: body.visibility,
        rideCoordinationEnabled: body.rideCoordinationEnabled,
      });
      return NextResponse.json({ ok: true, result }, privateResponse);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, ...privateResponse });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the proposal" }, { status: 400, ...privateResponse });
  }
}
