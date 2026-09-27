import type { SessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { createJoinCode } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { computeSetupProgress, isManualSetupItem } from "@/lib/organization-onboarding-policy";
import { ORGANIZATION_PRIVACY_VERSION, ORGANIZATION_TERMS_VERSION } from "@/lib/organization-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function getSetupChecklist(identity: SessionIdentity, organizationId: string) {
  const access = await assertIdentityOrganizationAdmin(identity, organizationId, { write: false });
  const db = dbRequired();
  const [org, signals, manual] = await Promise.all([
    db.query(`select id,coalesce(display_name,name) as name,slug,tenant_hostname,created_at from organizations where id=$1`, [organizationId]),
    db.query(
      `select
         ((select branding<>'{}'::jsonb from organizations where id=$1)
           or exists(select 1 from audit_events where organization_id=$1 and action='organization.branding_updated')) as branding,
         exists(select 1 from organization_join_codes where organization_id=$1 and status='active') as join_code,
         exists(select 1 from organization_driver_requirements where organization_id=$1 and updated_at>created_at+interval '1 second') as driver_requirements,
         exists(select 1 from organization_policy_acknowledgements where organization_id=$1 and terms_version=$2 and privacy_version=$3) as policies,
         (exists(select 1 from events where organization_id=$1)
           or exists(select 1 from google_connections where organization_id=$1 and status='active')
           or exists(select 1 from microsoft_connections where organization_id=$1 and status='active')) as events,
         (exists(select 1 from organization_invitations where organization_id=$1 and revoked_at is null and (accepted_at is not null or expires_at>now()))
           or (select count(*) from memberships where organization_id=$1 and group_id is null and status='active' and role in ('owner','admin','manager'))>=2) as co_admin,
         exists(select 1 from rides where organization_id=$1) as test_ride,
         (select count(*)::int from organization_join_codes where organization_id=$1 and status='active') as active_join_codes`,
      [organizationId, ORGANIZATION_TERMS_VERSION, ORGANIZATION_PRIVACY_VERSION]
    ),
    db.query(`select item_key from organization_setup_progress where organization_id=$1`, [organizationId]),
  ]);
  if (!org.rowCount) throw new Error("Organization not found");
  const s = signals.rows[0] || {};
  const progress = computeSetupProgress(
    {
      branding: s.branding === true,
      join_code: s.join_code === true,
      driver_requirements: s.driver_requirements === true,
      policies: s.policies === true,
      events: s.events === true,
      co_admin: s.co_admin === true,
      test_ride: s.test_ride === true,
    },
    manual.rows.map((row: any) => String(row.item_key))
  );
  return {
    organization: org.rows[0],
    role: access.organizationRole || (access.platformAccess ? "platform" : null),
    activeJoinCodes: Number(s.active_join_codes || 0),
    progress,
  };
}

export async function setManualSetupItem(identity: SessionIdentity, input: { organizationId: string; itemKey: string; done: boolean }) {
  await assertIdentityOrganizationAdmin(identity, input.organizationId, { write: true });
  if (!isManualSetupItem(input.itemKey)) throw new Error("This step is checked automatically");
  const db = dbRequired();
  if (input.done) {
    await db.query(
      `insert into organization_setup_progress (organization_id,item_key,completed_by_person_id) values ($1,$2,$3)
       on conflict (organization_id,item_key) do nothing`,
      [input.organizationId, input.itemKey, identity.personId]
    );
  } else {
    await db.query(`delete from organization_setup_progress where organization_id=$1 and item_key=$2`, [input.organizationId, input.itemKey]);
  }
  await db.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values ($1,$2,$3,'organization_setup_item',$4,'{}'::jsonb)`,
    [input.organizationId, identity.personId, input.done ? "organization_setup.item_completed" : "organization_setup.item_reopened", input.itemKey]
  );
}

export async function createSetupJoinCode(identity: SessionIdentity, input: { organizationId: string; label?: string | null }) {
  const access = await assertIdentityOrganizationAdmin(identity, input.organizationId, { write: true });
  if (access.organizationRole === "manager") throw new Error("Only owners and admins can create join codes");
  const label = String(input.label || "").trim().slice(0, 80) || "Main join code";
  const result = await createJoinCode({ organizationId: input.organizationId, label, defaultRole: "member" });
  await dbRequired().query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values ($1,$2,'join_code.created','organization',$3,$4::jsonb)`,
    [input.organizationId, identity.personId, input.organizationId, JSON.stringify({ label })]
  );
  return result;
}
