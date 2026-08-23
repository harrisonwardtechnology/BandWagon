import { requireAdminTestToken } from "@/lib/admin-test";
import { createPrivateLocation, getLocationForViewer, attachLocationsToRideRequest } from "@/lib/location-privacy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === 'create') {
      return Response.json({ok:true, location:await createPrivateLocation({
        organizationId:String(body.organizationId), ownerPersonId:body.ownerPersonId || null,
        label:body.label || null, address:String(body.address || ''),
        latitude:body.latitude == null ? null : Number(body.latitude), longitude:body.longitude == null ? null : Number(body.longitude),
        generalizedArea:body.generalizedArea || null, revealPolicy:body.revealPolicy || 'matched_driver'
      })});
    }
    if (body.action === 'attach') {
      return Response.json({ok:true, rideRequest:await attachLocationsToRideRequest({rideRequestId:String(body.rideRequestId),actorPersonId:String(body.actorPersonId),pickupLocationId:body.pickupLocationId || null,dropoffLocationId:body.dropoffLocationId || null})});
    }
    if (body.action === 'view') {
      return Response.json({ok:true, location:await getLocationForViewer({locationId:String(body.locationId),actorPersonId:String(body.actorPersonId),rideId:body.rideId || null})});
    }
    return Response.json({error:'Unknown action'},{status:400});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Location operation failed'},{status:500});
  }
}
