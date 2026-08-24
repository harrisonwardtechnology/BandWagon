import type { SessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import {
  ORGANIZATION_POLICY_CONFIRMATION,
  ORGANIZATION_PRIVACY_VERSION,
  ORGANIZATION_TERMS_VERSION,
  organizationPolicyAcceptanceError,
} from "@/lib/organization-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function organizationOwner(identity: SessionIdentity, organizationId: string) {
  if (identity.supportMode) throw new Error("Support Mode cannot accept organization policies");
  const db = dbRequired();
  const result = await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name,m.role
       from organizations o
       left join memberships m on m.organization_id=o.id
        and m.person_id=$2 and m.group_id is null and m.status='active'
      where o.id=$1 and o.status='active'
      limit 1`,
    [organizationId, identity.personId]
  );
  if (!result.rowCount) throw new Error("Organization not found or access denied");
  return result.rows[0];
}

export async function organizationPolicyStatus(identity: SessionIdentity, organizationId: string) {
  const organization = await organizationOwner(identity, organizationId);
  const db = dbRequired();
  const current = await db.query(
    `select opa.id,opa.terms_version,opa.privacy_version,opa.acknowledged_at,
            p.display_name as acknowledged_by
       from organization_policy_acknowledgements opa
       left join people p on p.id=opa.acknowledged_by_person_id
      where opa.organization_id=$1
        and opa.terms_version=$2
        and opa.privacy_version=$3
      limit 1`,
    [organizationId, ORGANIZATION_TERMS_VERSION, ORGANIZATION_PRIVACY_VERSION]
  );
  const history = await db.query(
    `select opa.id,opa.terms_version,opa.privacy_version,opa.acknowledgement_method,
            opa.acknowledged_at,p.display_name as acknowledged_by
       from organization_policy_acknowledgements opa
       left join people p on p.id=opa.acknowledged_by_person_id
      where opa.organization_id=$1
      order by opa.acknowledged_at desc`,
    [organizationId]
  );
  return {
    organization,
    canAccept: organization.role === "owner",
    current: current.rows[0] || null,
    currentVersions: { terms: ORGANIZATION_TERMS_VERSION, privacy: ORGANIZATION_PRIVACY_VERSION },
    confirmationPhrase: ORGANIZATION_POLICY_CONFIRMATION,
    history: history.rows,
  };
}

export async function acceptOrganizationPolicies(identity: SessionIdentity, input: {
  organizationId: string;
  authorityConfirmed: boolean;
  policiesReviewed: boolean;
  confirmation: string;
  sourceIp?: string | null;
  userAgent?: string | null;
}) {
  const organization = await organizationOwner(identity, input.organizationId);
  const validationError = organizationPolicyAcceptanceError({
    organizationRole: organization.role,
    authorityConfirmed: input.authorityConfirmed,
    policiesReviewed: input.policiesReviewed,
    confirmation: input.confirmation,
  });
  if (validationError) throw new Error(validationError);

  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into organization_policy_acknowledgements
        (organization_id,terms_version,privacy_version,acknowledged_by_person_id,
         authority_confirmed,source_ip_hash,user_agent_hash,metadata)
       values($1,$2,$3,$4,true,$5,$6,$7::jsonb)
       on conflict(organization_id,terms_version,privacy_version) do nothing
       returning id,terms_version,privacy_version,acknowledged_at`,
      [
        input.organizationId,
        ORGANIZATION_TERMS_VERSION,
        ORGANIZATION_PRIVACY_VERSION,
        identity.personId,
        input.sourceIp ? lookupHash(input.sourceIp) : null,
        input.userAgent ? lookupHash(input.userAgent) : null,
        JSON.stringify({ authorityConfirmed: true, policiesReviewed: true }),
      ]
    );
    if (!result.rowCount) throw new Error("The current policies have already been accepted for this organization");
    await client.query(
      `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata)
       values($1,$2,'organization.policies_accepted','organization',$1,$3::jsonb)`,
      [input.organizationId, identity.personId, JSON.stringify({
        termsVersion: ORGANIZATION_TERMS_VERSION,
        privacyVersion: ORGANIZATION_PRIVACY_VERSION,
      })]
    );
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
