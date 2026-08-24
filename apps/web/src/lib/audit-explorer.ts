import { getDb } from "@/lib/db";

function clean(value:unknown,max=200){return String(value||'').trim().slice(0,max);}
const SENSITIVE_KEY=/(password|passwd|secret|token|authorization|cookie|api.?key|private.?key|cipher|otp|code_hash|token_hash|access.?key|refresh.?token)/i;
function redact(value:any,depth=0):any{
  if(depth>8)return '[TRUNCATED]';
  if(Array.isArray(value))return value.slice(0,100).map(v=>redact(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,SENSITIVE_KEY.test(k)?'[REDACTED]':redact(v,depth+1)]));
  if(typeof value==='string'&&value.length>4000)return `${value.slice(0,4000)}…`;
  return value;
}

export async function queryAuditEvents(input:{organizationId?:string|null;action?:string|null;actor?:string|null;targetType?:string|null;outcome?:string|null;days?:number;limit?:number;offset?:number;maximumLimit?:number}){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const params:any[]=[];const where:string[]=[];
  const days=Math.max(1,Math.min(3650,Number(input.days||30)));params.push(days);where.push(`ae.occurred_at>=now()-($${params.length}||' days')::interval`);
  if(clean(input.organizationId)){params.push(clean(input.organizationId));where.push(`ae.organization_id=$${params.length}::uuid`);}
  if(clean(input.action)){params.push(`%${clean(input.action)}%`);where.push(`ae.action ilike $${params.length}`);}
  if(clean(input.actor)){params.push(`%${clean(input.actor)}%`);where.push(`(p.display_name ilike $${params.length} or e.normalized_email ilike $${params.length})`);}
  if(clean(input.targetType)){params.push(clean(input.targetType));where.push(`ae.target_type=$${params.length}`);}
  if(clean(input.outcome)){params.push(clean(input.outcome));where.push(`ae.outcome=$${params.length}`);}
  const maximumLimit=Math.max(1,Math.min(10000,Number(input.maximumLimit||500)));const limit=Math.max(1,Math.min(maximumLimit,Number(input.limit||100))),offset=Math.max(0,Number(input.offset||0));params.push(limit,offset);
  const result=await db.query(`select ae.id,ae.organization_id,coalesce(o.display_name,o.name) as organization_name,ae.actor_person_id,p.display_name as actor_name,
    ae.action,ae.target_type,ae.target_id,ae.outcome,ae.metadata,ae.occurred_at
    from audit_events ae
    left join organizations o on o.id=ae.organization_id
    left join people p on p.id=ae.actor_person_id
    left join lateral (select normalized_email from emails x where x.person_id=ae.actor_person_id order by verified_at desc nulls last limit 1) e on true
    where ${where.join(' and ')} order by ae.occurred_at desc limit $${params.length-1} offset $${params.length}`,params);
  return result.rows.map((row:any)=>({...row,metadata:redact(row.metadata||{})}));
}

export async function auditExplorerFacets(){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const [actions,organizations,targetTypes]=await Promise.all([
    db.query(`select action,count(*)::int as count,max(occurred_at) as last_seen from audit_events where occurred_at>=now()-interval '90 days' group by action order by count desc,action limit 100`),
    db.query(`select o.id,coalesce(o.display_name,o.name) as name,count(ae.id)::int as count from organizations o left join audit_events ae on ae.organization_id=o.id and ae.occurred_at>=now()-interval '90 days' group by o.id,o.display_name,o.name order by name`),
    db.query(`select target_type,count(*)::int as count from audit_events where occurred_at>=now()-interval '90 days' and target_type is not null group by target_type order by count desc,target_type`),
  ]);
  return{actions:actions.rows,organizations:organizations.rows,targetTypes:targetTypes.rows};
}
