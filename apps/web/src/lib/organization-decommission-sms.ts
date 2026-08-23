import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import { normalizePhoneInput } from "@/lib/phone-format";
import { confirmOrganizationDecommission } from "@/lib/organization-decommission";

export async function confirmOrganizationDecommissionFromMessage(input:{from:string;body:string}){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const match=String(input.body||"").trim().match(/^CONFIRM\s+(\d{6})$/i);
  if(!match)return{matched:false} as const;
  const phone=normalizePhoneInput(input.from,"US");
  if(!phone)throw new Error("Unable to validate the sending phone number");
  const code=match[1];
  const result=await db.query(`
    select c.organization_id,c.requested_by_person_id
    from organization_decommission_confirmations c
    join phones p on p.person_id=c.requested_by_person_id
    where c.code_hash=$1
      and c.status='pending'
      and c.expires_at>now()
      and p.lookup_hash=$2
      and p.verified_at is not null
    order by c.created_at desc limit 1`,[lookupHash(code),lookupHash(phone)]);
  if(!result.rowCount)throw new Error("That confirmation code is invalid, expired, or does not belong to this verified phone number");
  const row=result.rows[0];
  const confirmed=await confirmOrganizationDecommission({organizationId:row.organization_id,code,personId:row.requested_by_person_id,channel:"code"});
  await db.query(`insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,'organization.decommission.confirmed_sms','organization',$1,$3::jsonb)`,[row.organization_id,row.requested_by_person_id,JSON.stringify({phoneVerified:true})]).catch(()=>{});
  return{matched:true,confirmed} as const;
}
