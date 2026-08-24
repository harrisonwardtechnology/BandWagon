import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { addStudentToHousehold, configureSelfAsDriver, copyOrganizationMembershipToStudent, getOnboardingContext, joinOrganizationWithCode, setManagedStudentAccountAccess, updateManagedStudentSettings } from "@/lib/onboarding";
import { updateRouteAssistPreferences } from "@/lib/drivers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse={headers:{"cache-control":"no-store, private"}};

async function organizationScope() { const tenant=await resolveTenant(); return tenant.type==="organization"?tenant.organizationId:null; }

export async function GET(){try{const identity=await requireSessionIdentity();const scope=await organizationScope();return NextResponse.json({ok:true,identity,context:await getOnboardingContext(identity.personId,scope)},privateResponse);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Authentication required"},{status:401,...privateResponse});}}

export async function POST(request:Request){
  try{
    const identity=await requireSessionIdentity();const scope=await organizationScope();const body=await request.json().catch(()=>({}));let result:unknown;
    switch(body.action){
      case "add_student": result=await addStudentToHousehold({managerPersonId:identity.personId,displayName:String(body.displayName||""),preferredName:body.preferredName||null,birthYear:body.birthYear==null||body.birthYear===""?null:Number(body.birthYear),relationshipLabel:body.relationshipLabel||null,studentApprovalRequired:body.studentApprovalRequired!==false});break;
      case "join_organization": result=await joinOrganizationWithCode({personId:identity.personId,code:String(body.code||""),organizationScopeId:scope});break;
      case "add_student_to_organization": result=await copyOrganizationMembershipToStudent({managerPersonId:identity.personId,studentPersonId:String(body.studentPersonId),organizationId:String(body.organizationId),organizationScopeId:scope});break;
      case "update_student_settings": result=await updateManagedStudentSettings({managerPersonId:identity.personId,studentPersonId:String(body.studentPersonId),studentApprovalRequired:body.studentApprovalRequired!==false,requireVerifiedPickup:Boolean(body.requireVerifiedPickup),guardianConsentGranted:body.guardianConsentGranted!==false});break;
      case "set_student_account_access": result=await setManagedStudentAccountAccess({managerPersonId:identity.personId,studentPersonId:String(body.studentPersonId),email:String(body.email||""),enabled:body.enabled!==false});break;
      case "configure_driver": result=await configureSelfAsDriver({personId:identity.personId,organizationId:String(body.organizationId),organizationScopeId:scope,enabled:body.enabled!==false,capacity:Number(body.capacity||4),vehicleLabel:body.vehicleLabel||null,vehicleColor:body.vehicleColor||null,willingByDefault:body.willingByDefault!==false});break;
      case "configure_route_assist":
        if(scope&&scope!==String(body.organizationId)) throw new Error("This organization is not available on the current BandWagon tenant");
        result=await updateRouteAssistPreferences({organizationId:String(body.organizationId),personId:identity.personId,enabled:Boolean(body.enabled),maxExtraMinutes:Number(body.maxExtraMinutes??10),maxDeviationPercent:Number(body.maxDeviationPercent??10),notify:body.notify!==false});break;
      default:return NextResponse.json({error:"Unknown action"},{status:400,...privateResponse});
    }
    return NextResponse.json({ok:true,result,context:await getOnboardingContext(identity.personId,scope)},privateResponse);
  }catch(error){const message=error instanceof Error?error.message:"Onboarding failed";return NextResponse.json({error:message},{status:message==="Authentication required"?401:400,...privateResponse});}
}
