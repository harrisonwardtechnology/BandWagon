import { requirePlatformRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addDriverZone, addRecurringAvailability, listDriverProfiles, setAvailabilityException, upsertDriverProfile } from "@/lib/drivers";
import { attachRequestToRide, getRideManifest, listPoolableRides, removeRequestFromRide } from "@/lib/carpool";
import { dismissMatchSuggestion, generateMatchSuggestions, listMatchSuggestions, notifyTopDriverMatches } from "@/lib/matching";
import { listRideRequests } from "@/lib/rides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const db = getDb(); if (!db) return Response.json({ error:"Database is not configured" }, { status:500 });
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const manifestRideId = url.searchParams.get("rideId");
  const organizations = await db.query(`select id,coalesce(display_name,name) as name,slug from organizations where status='active' order by name`);
  if (!organizationId) return Response.json({ organizations:organizations.rows });
  const [people,drivers,requests,rides,suggestions] = await Promise.all([
    db.query(`select distinct p.id,p.display_name,p.preferred_name,p.person_type,m.role
              from people p join memberships m on m.person_id=p.id
              where m.organization_id=$1 and m.status='active' order by p.display_name`, [organizationId]),
    listDriverProfiles(organizationId),
    listRideRequests(organizationId),
    listPoolableRides(organizationId),
    listMatchSuggestions(organizationId),
  ]);
  const manifest = manifestRideId ? await getRideManifest(manifestRideId).catch(()=>null) : null;
  return Response.json({ organizations:organizations.rows,people:people.rows,drivers,requests,rides,suggestions,manifest });
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const body = await request.json().catch(()=>({}));
  try {
    let result: unknown;
    switch (body.action) {
      case 'upsert_driver':
        result = await upsertDriverProfile({
          organizationId:String(body.organizationId),personId:String(body.personId),defaultCapacity:Number(body.defaultCapacity || 1),
          status:body.status || 'active',willingByDefault:Boolean(body.willingByDefault),allowMultiPassenger:body.allowMultiPassenger !== false,
          maxDetourMinutes:Number(body.maxDetourMinutes ?? 15),maxPickupRadiusKm:Number(body.maxPickupRadiusKm ?? 8),
          vehicleLabel:body.vehicleLabel || null,vehicleMake:body.vehicleMake || null,vehicleModel:body.vehicleModel || null,
          vehicleColor:body.vehicleColor || null,licensePlateHint:body.licensePlateHint || null,notes:body.notes || null,
        });
        break;
      case 'add_zone':
        result = await addDriverZone({
          organizationId:String(body.organizationId),driverPersonId:String(body.driverPersonId),label:String(body.label || 'Preferred area'),
          latitude:Number(body.latitude),longitude:Number(body.longitude),radiusKm:Number(body.radiusKm || 8),
        });
        break;
      case 'add_availability':
        result = await addRecurringAvailability({
          organizationId:String(body.organizationId),driverPersonId:String(body.driverPersonId),weekday:Number(body.weekday),
          startTime:String(body.startTime),endTime:String(body.endTime),timeZone:body.timeZone || 'America/Chicago',direction:body.direction || 'any',
        });
        break;
      case 'set_exception':
        result = await setAvailabilityException({
          organizationId:String(body.organizationId),driverPersonId:String(body.driverPersonId),date:String(body.date),available:Boolean(body.available),
          startTime:body.startTime || null,endTime:body.endTime || null,note:body.note || null,
        });
        break;
      case 'generate_matches':
        result = await generateMatchSuggestions({ rideRequestId:String(body.rideRequestId),requestedByPersonId:body.requestedByPersonId || null,limit:Number(body.limit || 10) });
        break;
      case 'notify_matches':
        result = await notifyTopDriverMatches({ rideRequestId:String(body.rideRequestId),limit:Number(body.limit || 3) });
        break;
      case 'dismiss_match':
        result = await dismissMatchSuggestion(String(body.suggestionId));
        break;
      case 'attach_request':
        result = await attachRequestToRide({ rideId:String(body.rideId),rideRequestId:String(body.rideRequestId),actorPersonId:String(body.actorPersonId) });
        break;
      case 'remove_request':
        result = await removeRequestFromRide({ rideId:String(body.rideId),rideRequestId:String(body.rideRequestId),actorPersonId:String(body.actorPersonId),reason:body.reason || null });
        break;
      case 'manifest':
        result = await getRideManifest(String(body.rideId));
        break;
      default:
        return Response.json({ error:"Unknown action" }, { status:400 });
    }
    return Response.json({ ok:true,result });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "Ride engine action failed" }, { status:400 });
  }
}
