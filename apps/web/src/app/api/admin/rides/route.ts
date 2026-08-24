import { requirePlatformRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { acceptRideOffer, approveRideRequest, createRideOffer, createRideRequest, listRideRequests, listRides } from "@/lib/rides";
import { transitionRide } from "@/lib/ride-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const db = getDb(); if (!db) return Response.json({ error: "Database is not configured" }, { status: 500 });
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const organizations = await db.query(`select id,coalesce(display_name,name) as name,slug from organizations where status='active' order by name`);
  if (!organizationId) return Response.json({ organizations: organizations.rows });
  const [people,events,requests,rides] = await Promise.all([
    db.query(`select distinct p.id,p.display_name,p.person_type,m.role from people p join memberships m on m.person_id=p.id where m.organization_id=$1 and m.status='active' order by p.display_name`, [organizationId]),
    db.query(`select id,title,starts_at,ends_at from events where organization_id=$1 and status='active' and ride_coordination_enabled=true order by starts_at nulls last,title`, [organizationId]),
    listRideRequests(organizationId),
    listRides(organizationId),
  ]);
  return Response.json({ organizations:organizations.rows, people:people.rows, events:events.rows, requests, rides });
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const body = await request.json().catch(() => ({}));
  try {
    let result: unknown;
    switch (body.action) {
      case 'create_request':
        result = await createRideRequest({ organizationId:String(body.organizationId), eventId:body.eventId || null, requesterPersonId:String(body.requesterPersonId), passengerPersonId:String(body.passengerPersonId), direction:body.direction || 'to_event', seatsNeeded:Number(body.seatsNeeded || 1), pickupNote:body.pickupNote || null, dropoffNote:body.dropoffNote || null, requestedPickupAt:body.requestedPickupAt || null });
        break;
      case 'approve_request':
        result = await approveRideRequest({ rideRequestId:String(body.rideRequestId), guardianPersonId:String(body.guardianPersonId), approve:body.approve !== false });
        break;
      case 'create_offer':
        result = await createRideOffer({ rideRequestId:String(body.rideRequestId), driverPersonId:String(body.driverPersonId), seatsOffered:Number(body.seatsOffered || 1), note:body.note || null, proposedPickupAt:body.proposedPickupAt || null });
        break;
      case 'accept_offer':
        result = await acceptRideOffer({ rideRequestId:String(body.rideRequestId), offerId:String(body.offerId), actorPersonId:String(body.actorPersonId) });
        break;
      case 'transition_ride':
        result = await transitionRide({ rideId:String(body.rideId), actorPersonId:String(body.actorPersonId), toStatus:String(body.toStatus), reason:body.reason || null });
        break;
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json({ ok:true, result });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "Ride workflow failed" }, { status: 400 });
  }
}
