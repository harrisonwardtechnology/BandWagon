import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { redactApplicationErrorText } from "@/lib/error-monitoring-policy";

export async function recordApplicationError(error:unknown,input:{routePath?:string|null;method?:string|null;routerKind?:string|null;routeType?:string|null;metadata?:Record<string,unknown>}={}){
  const db=getDb();if(!db)return;
  const source=error instanceof Error?error:new Error(typeof error==="string"?error:"Unknown application error");
  const routePath=redactApplicationErrorText(String(input.routePath||"unknown")).slice(0,500);
  const name=String(source.name||"Error").slice(0,120);
  const message=redactApplicationErrorText(String(source.message||"Application error")).slice(0,1000);
  const stack=source.stack?redactApplicationErrorText(source.stack).replaceAll(process.cwd(),"<app>").slice(0,6000):null;
  const fingerprint=crypto.createHash("sha256").update(`${name}\n${message}\n${routePath}`).digest("hex");
  await db.query(
    `insert into application_errors(fingerprint,error_name,message,route_path,request_method,router_kind,route_type,last_stack,metadata)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     on conflict(fingerprint) do update set occurrence_count=application_errors.occurrence_count+1,last_seen_at=now(),
       request_method=excluded.request_method,router_kind=excluded.router_kind,route_type=excluded.route_type,
       last_stack=excluded.last_stack,metadata=application_errors.metadata||excluded.metadata,
       status=case when application_errors.status='resolved' then 'open' else application_errors.status end,resolved_at=null,resolved_by_person_id=null`,
    [fingerprint,name,message,routePath,input.method||null,input.routerKind||null,input.routeType||null,stack,JSON.stringify(input.metadata||{})]
  );
}

export async function resolveApplicationError(id:string,resolvedByPersonId:string){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const result=await db.query(`update application_errors set status='resolved',resolved_at=now(),resolved_by_person_id=$2 where id=$1 and status<>'resolved' returning id`,[id,resolvedByPersonId]);
  if(!result.rowCount)throw new Error("Open application error was not found");
  await db.query(`insert into audit_events(actor_person_id,action,target_type,target_id,metadata) values($1,'platform.application_error_resolved','application_error',$2,'{}'::jsonb)`,[resolvedByPersonId,id]);
  return{id,resolved:true};
}
