import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { acceptOfferAsCurrentUser, createUserRideRequest, getProductDashboard, offerRideAsCurrentUser, refreshUserMatches, transitionRideAsCurrentUser, viewRideLocation } from "@/lib/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await requireSessionIdentity();
    return NextResponse.json({ ok:true, dashboard:await getProductDashboard(identity) });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Authentication required" }, { status:401 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(()=>({}));
    let result: unknown;
    switch (body.action) {
      case "create_request":
        result = await createUserRideRequest(identity,{
          organizationId:String(body.organizationId),
          eventId:body.eventId || null,
          passengerPersonId:String(body.passengerPersonId),
          direction:body.direction || 'to_event',
          seatsNeeded:Number(body.seatsNeeded || 1),
          requestedPickupAt:body.requestedPickupAt || null,
          pickupNote:body.pickupNote || null,
          dropoffNote:body.dropoffNote || null,
          pickupAddress:body.pickupAddress || null,
          dropoffAddress:body.dropoffAddress || null,
        });
        break;
      case "offer_ride":
        result = await offerRideAsCurrentUser(identity,{
          rideRequestId:String(body.rideRequestId),
          seatsOffered:Number(body.seatsOffered || 1),
          note:body.note || null,
          proposedPickupAt:body.proposedPickupAt || null,
        });
        break;
      case "accept_offer":
        result = await acceptOfferAsCurrentUser(identity,{ rideRequestId:String(body.rideRequestId),offerId:String(body.offerId) });
        break;
      case "transition_ride":
        result = await transitionRideAsCurrentUser(identity,{ rideId:String(body.rideId),toStatus:String(body.toStatus),reason:body.reason || null });
        break;
      case "refresh_matches":
        result = await refreshUserMatches(identity,String(body.rideRequestId));
        break;
      case "view_location":
        result = await viewRideLocation(identity,{ locationId:String(body.locationId),rideId:body.rideId || null });
        return NextResponse.json({ ok:true,result });
      default:
        return NextResponse.json({ error:"Unknown action" }, { status:400 });
    }
    return NextResponse.json({ ok:true,result,dashboard:await getProductDashboard(identity) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ride action failed";
    return NextResponse.json({ error:message }, { status:message === "Authentication required" ? 401 : 400 });
  }
}
