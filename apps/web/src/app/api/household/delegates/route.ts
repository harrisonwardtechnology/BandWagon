import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import {
  cancelDelegateInvitation,
  createDelegateInvitation,
  getDelegateOverview,
  getHouseholdDelegates,
  leaveDelegation,
  setDelegateStatus,
  updateDelegate,
} from "@/lib/household-delegates";
import { acceptOfferAsCurrentUser, approveRideAsCurrentUser, createUserRideRequest, transitionRideAsCurrentUser } from "@/lib/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, private" };

async function organizationScope() {
  const tenant = await resolveTenant();
  return tenant.type === "organization" ? tenant.organizationId : null;
}

async function snapshot(identity: Awaited<ReturnType<typeof requireSessionIdentity>>) {
  // Only household managers see the trusted adults screen. Everyone sees the families they help with.
  const guardian = await getHouseholdDelegates(identity).catch(() => null);
  const delegate = await getDelegateOverview(identity);
  return { guardian, delegate };
}

export async function GET() {
  let identity;
  try {
    identity = await requireSessionIdentity();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
  }
  try {
    return NextResponse.json({ ok: true, ...(await snapshot(identity)) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load trusted adults" }, { status: 400, headers });
  }
}

export async function POST(request: Request) {
  let identity;
  try {
    identity = await requireSessionIdentity();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
  }
  const body = await request.json().catch(() => ({}));
  try {
    let result: unknown = null;
    switch (body.action) {
      // Guardian actions
      case "invite":
        result = await createDelegateInvitation(identity, {
          contactType: body.contactType,
          contact: body.contact,
          relationshipLabel: body.relationshipLabel,
          scopes: body.scopes,
          childScope: body.childScope,
          childIds: body.childIds,
          endsAt: body.endsAt,
        });
        break;
      case "cancel_invitation":
        await cancelDelegateInvitation(identity, String(body.invitationId || ""));
        break;
      case "update":
        await updateDelegate(identity, {
          delegateId: String(body.delegateId || ""),
          relationshipLabel: body.relationshipLabel,
          scopes: body.scopes,
          childScope: body.childScope,
          childIds: body.childIds,
          endsAt: body.endsAt,
        });
        break;
      case "pause":
        await setDelegateStatus(identity, { delegateId: String(body.delegateId || ""), status: "paused" });
        break;
      case "resume":
        await setDelegateStatus(identity, { delegateId: String(body.delegateId || ""), status: "active" });
        break;
      case "revoke":
        await setDelegateStatus(identity, { delegateId: String(body.delegateId || ""), status: "revoked" });
        break;
      // Delegate actions. Each one is checked again by canActForChild.
      case "leave":
        await leaveDelegation(identity, String(body.delegateId || ""));
        break;
      case "request_ride": {
        const scope = await organizationScope();
        result = await createUserRideRequest(identity, {
          organizationId: String(body.organizationId || ""),
          organizationScopeId: scope,
          eventId: body.eventId || null,
          passengerPersonId: String(body.childId || ""),
          direction: ["to_event", "from_event", "round_trip", "other"].includes(body.direction) ? body.direction : "to_event",
          seatsNeeded: 1,
          requestedPickupAt: body.requestedPickupAt || null,
          pickupNote: body.pickupNote || null,
          pickupAddress: body.pickupAddress || null,
        });
        break;
      }
      case "approve_request":
      case "deny_request":
        result = await approveRideAsCurrentUser(identity, { rideRequestId: String(body.rideRequestId || ""), approve: body.action === "approve_request", organizationScopeId: await organizationScope() });
        break;
      case "accept_offer":
        result = await acceptOfferAsCurrentUser(identity, { rideRequestId: String(body.rideRequestId || ""), offerId: String(body.offerId || ""), organizationScopeId: await organizationScope() });
        break;
      case "cancel_ride":
        result = await transitionRideAsCurrentUser(identity, { rideId: String(body.rideId || ""), toStatus: "cancelled", reason: body.reason || null, organizationScopeId: await organizationScope() });
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
    }
    return NextResponse.json({ ok: true, result, ...(await snapshot(identity)) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save" }, { status: 400, headers });
  }
}
