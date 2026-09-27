import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { validateSponsorInput } from "@/lib/sponsor-policy";

// Core Funding Boundary: sponsors get adult-facing recognition only. Nothing
// here reads or returns participant data (riders, drivers, families, rides,
// locations). Sponsors never get matching priority or targeted advertising.
// Internal notes are visible to organization admins only, never on public pages.

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

const SPONSOR_COLUMNS = `id,sponsor_name,sponsor_website,logo_url,tier_label,public_display,starts_at,ends_at,status,internal_notes,contribution_id,created_at,updated_at`;

export async function listOrganizationSponsors(organizationId: string) {
  const db = dbRequired();
  return (await db.query(`select ${SPONSOR_COLUMNS} from organization_sponsors where organization_id=$1 order by (status='active') desc, starts_at desc limit 500`, [organizationId])).rows;
}

/** Stripe sponsorship payments for this organization. Payer email is intentionally not returned. */
export async function listSponsorContributions(organizationId: string) {
  const db = dbRequired();
  const rows = (
    await db.query(
      `select id,amount_cents,currency,status,created_at,paid_at,refunded_at,
              case when anonymous then null else sponsor_name end as sponsor_name,
              case when anonymous then null else sponsor_website end as sponsor_website,
              sponsor_display_publicly,anonymous
         from support_contributions
        where organization_id=$1 and contribution_type='sponsor' and status in ('paid','refunded')
        order by coalesce(paid_at,created_at) desc limit 200`,
      [organizationId]
    )
  ).rows;
  const totals = (
    await db.query(
      `select coalesce(sum(amount_cents) filter (where status='paid'),0)::int as paid_cents,
              coalesce(sum(amount_cents) filter (where status='paid' and paid_at>=date_trunc('year',now())),0)::int as paid_this_year_cents
         from support_contributions where organization_id=$1 and contribution_type='sponsor'`,
      [organizationId]
    )
  ).rows[0];
  return { contributions: rows, paidCents: Number(totals?.paid_cents || 0), paidThisYearCents: Number(totals?.paid_this_year_cents || 0) };
}

async function audit(organizationId: string, actorPersonId: string, action: string, sponsorId: string, metadata: Record<string, unknown>) {
  await dbRequired().query(
    `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,$3,'organization_sponsor',$4,$5::jsonb)`,
    [organizationId, actorPersonId, action, sponsorId, JSON.stringify(metadata)]
  );
}

function auditSummary(value: ReturnType<typeof validateSponsorInput>) {
  // Keep internal notes out of the audit log; record only that they changed.
  return { sponsorName: value.sponsorName, sponsorWebsite: value.sponsorWebsite, logoUrl: value.logoUrl, tierLabel: value.tierLabel, publicDisplay: value.publicDisplay, startsAt: value.startsAt, endsAt: value.endsAt, hasInternalNotes: Boolean(value.internalNotes) };
}

export async function createOrganizationSponsor(identity: SessionIdentity, organizationId: string, body: Record<string, unknown>) {
  const value = validateSponsorInput(body);
  const db = dbRequired();
  const count = Number((await db.query(`select count(*)::int as c from organization_sponsors where organization_id=$1`, [organizationId])).rows[0]?.c || 0);
  if (count >= 500) throw new Error("This organization has reached the sponsor record limit");
  const row = (
    await db.query(
      `insert into organization_sponsors(organization_id,sponsor_name,sponsor_website,logo_url,tier_label,public_display,starts_at,ends_at,internal_notes,status,created_by_person_id,updated_by_person_id,updated_at)
       values($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,now()),$8,$9,'active',$10,$10,now())
       returning ${SPONSOR_COLUMNS}`,
      [organizationId, value.sponsorName, value.sponsorWebsite, value.logoUrl, value.tierLabel, value.publicDisplay, value.startsAt, value.endsAt, value.internalNotes, identity.personId]
    )
  ).rows[0];
  await audit(organizationId, identity.personId, "organization_sponsor_created", row.id, auditSummary(value));
  return row;
}

export async function updateOrganizationSponsor(identity: SessionIdentity, organizationId: string, sponsorId: string, body: Record<string, unknown>) {
  const value = validateSponsorInput(body);
  const db = dbRequired();
  const row = (
    await db.query(
      `update organization_sponsors
          set sponsor_name=$3,sponsor_website=$4,logo_url=$5,tier_label=$6,public_display=$7,
              starts_at=coalesce($8::timestamptz,starts_at),ends_at=$9,internal_notes=$10,
              updated_by_person_id=$11,updated_at=now()
        where id=$1 and organization_id=$2
        returning ${SPONSOR_COLUMNS}`,
      [sponsorId, organizationId, value.sponsorName, value.sponsorWebsite, value.logoUrl, value.tierLabel, value.publicDisplay, value.startsAt, value.endsAt, value.internalNotes, identity.personId]
    )
  ).rows[0];
  if (!row) throw new Error("Sponsor not found");
  await audit(organizationId, identity.personId, "organization_sponsor_updated", row.id, auditSummary(value));
  return row;
}

export async function endOrganizationSponsor(identity: SessionIdentity, organizationId: string, sponsorId: string) {
  const db = dbRequired();
  const row = (
    await db.query(
      `update organization_sponsors
          set status='ended',ends_at=case when ends_at is null or ends_at>now() then now() else ends_at end,
              updated_by_person_id=$3,updated_at=now()
        where id=$1 and organization_id=$2
        returning ${SPONSOR_COLUMNS}`,
      [sponsorId, organizationId, identity.personId]
    )
  ).rows[0];
  if (!row) throw new Error("Sponsor not found");
  await audit(organizationId, identity.personId, "organization_sponsor_ended", row.id, { sponsorName: row.sponsor_name });
  return row;
}
