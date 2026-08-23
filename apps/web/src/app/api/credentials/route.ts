import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { createCredentialUpload,credentialViewUrl,finalizeCredentialUpload,listMyCredentials } from "@/lib/credentials";
import { processMyCredential } from "@/lib/credential-review";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{const identity=await requireSessionIdentity();return NextResponse.json({ok:true,documents:await listMyCredentials(identity)});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Authentication required"},{status:401});}
}

export async function POST(request:Request){
  try{
    const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));
    if(body.action==="create_upload"){
      const result=await createCredentialUpload(identity,{documentType:body.documentType,filename:String(body.filename||"document"),contentType:String(body.contentType||""),sizeBytes:Number(body.sizeBytes||0)});
      return NextResponse.json({ok:true,result});
    }
    if(body.action==="finalize_upload")return NextResponse.json({ok:true,result:await finalizeCredentialUpload(identity,String(body.documentId||""))});
    if(body.action==="view")return NextResponse.json({ok:true,result:await credentialViewUrl(identity,{documentId:String(body.documentId||""),organizationId:body.organizationId||null})});
    if(body.action==="process")return NextResponse.json({ok:true,result:await processMyCredential(identity,{documentId:String(body.documentId||""),organizationId:body.organizationId||null})});
    return NextResponse.json({error:"Unknown action"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Credential action failed"},{status:400});}
}
