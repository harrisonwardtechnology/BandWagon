import type { PoolClient } from "pg";
import type { SessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createManualEvent } from "@/lib/events";
import { queueNotification } from "@/lib/notification-queue";
import {
  approvedEventInput,
  assertProposalTransition,
  canManageProposalSettings,
  canModerateProposals,
  isEventProposalStatus,
  proposalSubmitDenial,
  proposerScope,
  validateModeratorNote,
  validateProposalInput,
  type ProposalFields,
} from "@/lib/event-proposal-policy";

type Queryable = Pick<PoolClient, "query">;

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await dbRequired().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function auditProposal(db: Queryable, input: { organizationId: string; actorPersonId: string | null; action: string; proposalId: string; metadata?: Record<string, unknown> }) {
  await db.query(
    `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata)
     values($1::uuid,$2::uuid,$3,'event_proposal',$4::text,$5::jsonb)`,
    [input.organizationId, input.actorPersonId, input.action, input.proposalId, JSON.stringify(input.metadata || {})]
  );
}

export async function getEventProposalSettings(organizationId: string, db: Queryable = dbRequired()) {
  const result = await db.query(
    `select organization_id,enabled,proposer_scope,updated_at from organization_event_proposal_settings where organization_id=$1`,
    [organizationId]
  );
  const row = result.rows[0];
  return { organizationId, enabled: Boolean(row?.enabled), proposerScope: proposerScope(row?.proposer_scope), updatedAt: row?.updated_at || null };
}

export async function updateEventProposalSettings(input: {
  organizationId: string;
  enabled: boolean;
  proposerScope: unknown;
  actorPersonId: string;
  organizationRole: unknown;
  platformAccess: boolean;
}) {
  if (!canManageProposalSettings(input.organizationRole, input.platformAccess)) {
    throw new Error("Only organization owners and admins can change event proposal settings");
  }
  const scope = proposerScope(input.proposerScope);
  return inTransaction(async (client) => {
    await client.query(
      `insert into organization_event_proposal_settings(organization_id,enabled,proposer_scope,updated_by_person_id)
       values($1,$2,$3,$4)
       on conflict(organization_id) do update set enabled=excluded.enabled,proposer_scope=excluded.proposer_scope,
         updated_by_person_id=excluded.updated_by_person_id,updated_at=now()`,
      [input.organizationId, input.enabled, scope, input.actorPersonId]
    );
    await client.query(
      `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata)
       values($1::uuid,$2::uuid,'organization.event_proposal_settings_updated','organization',$1::text,$3::jsonb)`,
      [input.organizationId, input.actorPersonId, JSON.stringify({ enabled: input.enabled, proposerScope: scope })]
    );
    return getEventProposalSettings(input.organizationId, client);
  });
}

async function proposerFacts(db: Queryable, organizationId: string, personId: string) {
  const result = await db.query(
    `select p.person_type,
            exists(select 1 from memberships m where m.organization_id=$1 and m.person_id=$2 and m.status='active') as is_member,
            exists(
              select 1 from guardian_relationships gr
              join memberships sm on sm.person_id=gr.minor_person_id and sm.organization_id=$1 and sm.status='active'
              where gr.guardian_person_id=$2
            ) as is_guardian,
            (select count(*)::int from event_proposals ep
              where ep.organization_id=$1 and ep.proposer_person_id=$2 and ep.created_at > now()-interval '24 hours') as submitted_last_24h,
            (select count(*)::int from event_proposals ep
              where ep.organization_id=$1 and ep.proposer_person_id=$2 and ep.status in ('pending','changes_requested')) as open_count
       from people p where p.id=$2`,
    [organizationId, personId]
  );
  const row = result.rows[0] || {};
  return {
    personType: row.person_type ?? null,
    isActiveMember: Boolean(row.is_member),
    isGuardianInOrganization: Boolean(row.is_guardian),
    submittedLast24h: Number(row.submitted_last_24h || 0),
    openCount: Number(row.open_count || 0),
  };
}

async function submitDenialFor(db: Queryable, identity: SessionIdentity, organizationId: string, options: { resubmitting?: boolean } = {}) {
  const [settings, facts] = await Promise.all([
    getEventProposalSettings(organizationId, db),
    proposerFacts(db, organizationId, identity.personId),
  ]);
  return proposalSubmitDenial({
    moduleEnabled: settings.enabled,
    scope: settings.proposerScope,
    personType: identity.personType === "minor" ? "minor" : facts.personType,
    isActiveMember: facts.isActiveMember,
    isGuardianInOrganization: facts.isGuardianInOrganization,
    supportMode: Boolean(identity.supportMode),
    submittedLast24h: facts.submittedLast24h,
    openCount: facts.openCount,
    resubmitting: options.resubmitting,
  });
}

async function moderatorPersonIds(db: Queryable, organizationId: string) {
  const result = await db.query(
    `select distinct person_id from memberships
      where organization_id=$1 and group_id is null and status='active' and role in ('owner','admin','manager')`,
    [organizationId]
  );
  return result.rows.map((row: { person_id: string }) => row.person_id);
}

async function notifyModerators(organizationId: string, proposerPersonId: string, proposal: { id: string; title: string }, resubmitted: boolean) {
  try {
    const db = dbRequired();
    const [moderators, proposer] = await Promise.all([
      moderatorPersonIds(db, organizationId),
      db.query(`select coalesce(preferred_name,display_name) as name from people where id=$1`, [proposerPersonId]),
    ]);
    const name = proposer.rows[0]?.name || "A member";
    const body = resubmitted
      ? `${name} updated the event proposal "${proposal.title}". It is ready for another review.`
      : `${name} proposed a new event: "${proposal.title}". Review it in BandWagon.`;
    await Promise.allSettled(
      moderators
        .filter((personId: string) => personId !== proposerPersonId)
        .map((personId: string) =>
          queueNotification({
            notificationType: "event_proposal_submitted",
            title: resubmitted ? "Event proposal updated" : "New event proposal",
            body,
            personId,
            organizationId,
            url: `/admin/event-proposals?organizationId=${encodeURIComponent(organizationId)}`,
          })
        )
    );
  } catch {
    // Notifications never block a saved proposal.
  }
}

async function notifyProposer(organizationId: string, proposerPersonId: string | null, title: string, outcome: "approved" | "changes_requested" | "declined") {
  if (!proposerPersonId) return;
  const copy = {
    approved: { title: "Your event was approved", body: `Good news. "${title}" was approved and is now on the calendar.` },
    changes_requested: { title: "Changes requested on your event", body: `An organizer asked for changes to "${title}". Open BandWagon to see the note and update it.` },
    declined: { title: "Your event proposal was declined", body: `"${title}" was not approved. Open BandWagon to see the reason.` },
  }[outcome];
  await queueNotification({
    notificationType: "event_proposal_decision",
    title: copy.title,
    body: copy.body,
    personId: proposerPersonId,
    organizationId,
    url: "/app/event-proposals",
  }).catch(() => {});
}

const PROPOSAL_COLUMNS = `ep.id,ep.organization_id,ep.proposer_person_id,ep.title,ep.description,ep.location_name,ep.location_address,
  ep.starts_at,ep.ends_at,ep.all_day,ep.expected_riders,ep.notes,ep.status,ep.moderator_note,ep.decided_at,
  ep.approved_event_id,ep.submitted_at,ep.created_at,ep.updated_at`;

/** Organizations the member belongs to, whether each accepts proposals from them, and their proposals. */
export async function memberEventProposalContext(identity: SessionIdentity) {
  const db = dbRequired();
  const orgs = await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name
       from organizations o
      where o.status='active' and o.id=any($1::uuid[])
      order by name`,
    [identity.organizationIds]
  );
  const organizations = [];
  for (const org of orgs.rows) {
    const settings = await getEventProposalSettings(org.id, db);
    const reason = settings.enabled ? await submitDenialFor(db, identity, org.id) : "This organization is not accepting event proposals";
    organizations.push({ id: org.id, name: org.name, enabled: settings.enabled, proposerScope: settings.proposerScope, canPropose: !reason, reason });
  }
  const proposals = await db.query(
    `select ${PROPOSAL_COLUMNS},coalesce(o.display_name,o.name) as organization_name
       from event_proposals ep join organizations o on o.id=ep.organization_id
      where ep.proposer_person_id=$1 and ep.organization_id=any($2::uuid[])
      order by ep.created_at desc limit 100`,
    [identity.personId, identity.organizationIds]
  );
  return { organizations, proposals: proposals.rows };
}

export async function submitEventProposal(identity: SessionIdentity, organizationId: string, raw: Record<string, unknown>) {
  if (!organizationId) throw new Error("Choose an organization");
  const fields = validateProposalInput(raw);
  const proposal = await inTransaction(async (client) => {
    // Serialize submissions per member and organization so the rate limit holds.
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`event-proposal:${organizationId}:${identity.personId}`]);
    const denial = await submitDenialFor(client, identity, organizationId);
    if (denial) throw new Error(denial);
    const inserted = await client.query(
      `insert into event_proposals(organization_id,proposer_person_id,title,description,location_name,location_address,
         starts_at,ends_at,all_day,expected_riders,notes)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id,title,status`,
      [organizationId, identity.personId, fields.title, fields.description, fields.locationName, fields.locationAddress,
       fields.startsAt, fields.endsAt, fields.allDay, fields.expectedRiders, fields.notes]
    );
    const row = inserted.rows[0];
    await auditProposal(client, { organizationId, actorPersonId: identity.personId, action: "event_proposal.submitted", proposalId: row.id, metadata: { startsAt: fields.startsAt, expectedRiders: fields.expectedRiders } });
    return row;
  });
  await notifyModerators(organizationId, identity.personId, proposal, false);
  return proposal;
}

async function lockOwnProposal(client: Queryable, identity: SessionIdentity, proposalId: string) {
  const result = await client.query(
    `select * from event_proposals where id=$1 and proposer_person_id=$2 and organization_id=any($3::uuid[]) for update`,
    [proposalId, identity.personId, identity.organizationIds]
  );
  if (!result.rows[0]) throw new Error("Proposal not found");
  return result.rows[0];
}

export async function resubmitEventProposal(identity: SessionIdentity, proposalId: string, raw: Record<string, unknown>) {
  const fields = validateProposalInput(raw);
  const proposal = await inTransaction(async (client) => {
    const current = await lockOwnProposal(client, identity, proposalId);
    assertProposalTransition(current.status, "resubmit");
    const denial = await submitDenialFor(client, identity, current.organization_id, { resubmitting: true });
    if (denial) throw new Error(denial);
    const updated = await client.query(
      `update event_proposals set title=$2,description=$3,location_name=$4,location_address=$5,starts_at=$6,ends_at=$7,
         all_day=$8,expected_riders=$9,notes=$10,status='pending',submitted_at=now(),updated_at=now()
       where id=$1 returning id,title,status,organization_id`,
      [proposalId, fields.title, fields.description, fields.locationName, fields.locationAddress, fields.startsAt, fields.endsAt,
       fields.allDay, fields.expectedRiders, fields.notes]
    );
    await auditProposal(client, { organizationId: current.organization_id, actorPersonId: identity.personId, action: "event_proposal.resubmitted", proposalId });
    return updated.rows[0];
  });
  await notifyModerators(proposal.organization_id, identity.personId, proposal, true);
  return proposal;
}

export async function withdrawEventProposal(identity: SessionIdentity, proposalId: string) {
  if (identity.supportMode) throw new Error("Event proposals cannot be changed from Support View");
  return inTransaction(async (client) => {
    const current = await lockOwnProposal(client, identity, proposalId);
    assertProposalTransition(current.status, "withdraw");
    const updated = await client.query(
      `update event_proposals set status='withdrawn',updated_at=now() where id=$1 returning id,title,status`,
      [proposalId]
    );
    await auditProposal(client, { organizationId: current.organization_id, actorPersonId: identity.personId, action: "event_proposal.withdrawn", proposalId });
    return updated.rows[0];
  });
}

export async function listEventProposalsForModeration(organizationId: string, status?: unknown) {
  const db = dbRequired();
  const filter = status === "open" || !status ? ["pending", "changes_requested"] : isEventProposalStatus(status) ? [status] : ["pending", "changes_requested", "approved", "declined", "withdrawn"];
  const result = await db.query(
    `select ${PROPOSAL_COLUMNS},coalesce(p.preferred_name,p.display_name) as proposer_name,
            coalesce(d.preferred_name,d.display_name) as decided_by_name
       from event_proposals ep
       left join people p on p.id=ep.proposer_person_id
       left join people d on d.id=ep.decided_by_person_id
      where ep.organization_id=$1 and ep.status=any($2::text[])
      order by case when ep.status='pending' then 0 else 1 end, ep.submitted_at desc
      limit 200`,
    [organizationId, filter]
  );
  return result.rows;
}

export type ModerationAction = "approve" | "request_changes" | "decline";

function rowToFields(row: Record<string, any>): Record<string, unknown> {
  return {
    title: row.title,
    description: row.description,
    locationName: row.location_name,
    locationAddress: row.location_address,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : row.ends_at,
    allDay: row.all_day === true,
    expectedRiders: row.expected_riders,
    notes: row.notes,
  };
}

export async function moderateEventProposal(input: {
  identity: SessionIdentity;
  organizationRole: unknown;
  platformAccess: boolean;
  organizationId: string;
  proposalId: string;
  action: ModerationAction;
  note?: unknown;
  edits?: Partial<Record<keyof ProposalFields, unknown>>;
  visibility?: unknown;
  rideCoordinationEnabled?: unknown;
}) {
  if (!canModerateProposals(input.organizationRole, input.platformAccess)) {
    throw new Error("Only organization owners, admins, and managers can review event proposals");
  }
  if (!["approve", "request_changes", "decline"].includes(input.action)) throw new Error("Unknown review action");
  const note = input.action === "approve"
    ? (input.note ? validateModeratorNote(input.note, "request_changes") : null)
    : validateModeratorNote(input.note, input.action);

  const outcome = await inTransaction(async (client) => {
    const current = await client.query(
      `select * from event_proposals where id=$1 and organization_id=$2 for update`,
      [input.proposalId, input.organizationId]
    );
    const proposal = current.rows[0];
    if (!proposal) throw new Error("Proposal not found");
    const nextStatus = assertProposalTransition(proposal.status, input.action);
    let eventId: string | null = null;
    let title: string = proposal.title;

    if (input.action === "approve") {
      const edits = Object.fromEntries(Object.entries(input.edits || {}).filter(([, value]) => value !== undefined));
      const fields = validateProposalInput({ ...rowToFields(proposal), ...edits });
      const eventInput = approvedEventInput({
        organizationId: input.organizationId,
        proposal: { ...fields, proposerPersonId: proposal.proposer_person_id },
        visibility: input.visibility,
        rideCoordinationEnabled: input.rideCoordinationEnabled,
        moderatorPersonId: input.identity.personId,
      });
      // Same code path organizers use for manual events, inside this transaction.
      const event = await createManualEvent({ ...eventInput, auditMetadata: { eventProposalId: proposal.id } }, { client });
      eventId = event.id;
      title = event.title;
    }

    await client.query(
      `update event_proposals set status=$2,moderator_note=$3,decided_by_person_id=$4,decided_at=now(),
         approved_event_id=coalesce($5::uuid,approved_event_id),updated_at=now()
       where id=$1`,
      [proposal.id, nextStatus, note, input.identity.personId, eventId]
    );
    const action = { approve: "event_proposal.approved", request_changes: "event_proposal.changes_requested", decline: "event_proposal.declined" }[input.action];
    await auditProposal(client, {
      organizationId: input.organizationId,
      actorPersonId: input.identity.personId,
      action,
      proposalId: proposal.id,
      metadata: { eventId, proposerPersonId: proposal.proposer_person_id, hasNote: Boolean(note) },
    });
    return { proposalId: proposal.id, status: nextStatus, eventId, title, proposerPersonId: proposal.proposer_person_id as string | null };
  });

  await notifyProposer(input.organizationId, outcome.proposerPersonId, outcome.title, outcome.status as "approved" | "changes_requested" | "declined");
  return outcome;
}
