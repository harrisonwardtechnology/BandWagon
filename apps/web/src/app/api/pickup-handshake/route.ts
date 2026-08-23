import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { confirmPickupHandshake,getRidePickupHandshake,resolvePickupFallbackCode,resolvePickupHandshakeToken,startPickupHandshake } from "@/lib/pickup-handshake";

export const runtime="nodejs";export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{const identity=await requireSessionIdentity();const url=new URL(request.url);const rideId=url.searchParams.get("rideId");const token=url.searchParams.get("token");
    if(token)return NextResponse.json({ok:true,result:await resolvePickupHandshakeToken(identity,token)});
    if(!rideId)return NextResponse.json({error:"rideId is required"},{status:400});
    return NextResponse.json({ok:true,result:await getRidePickupHandshake(identity,rideId)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pickup verification failed"},{status:400});}
}

export async function POST(request:Request){
  try{const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));
    if(body.action==="start")return NextResponse.json({ok:true,result:await startPickupHandshake(identity,String(body.rideId||""))});
    if(body.action==="resolve_code")return NextResponse.json({ok:true,result:await resolvePickupFallbackCode(identity,String(body.rideId||""),String(body.code||""))});
    if(body.action==="confirm")return NextResponse.json({ok:true,result:await confirmPickupHandshake(identity,String(body.handshakeId||""))});
    return NextResponse.json({error:"Unknown action"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pickup verification failed"},{status:400});}
}
