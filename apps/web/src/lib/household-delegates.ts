import crypto from "node:crypto";
import type { SessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import { sendEmailNotification } from "@/lib/email-send";
import { queueNotification } from "@/lib/notification-queue";
import { normalizePhoneInput } from "@/lib/phone-format";
import { appBaseUrl, verifiedEmailsForPerson } from "@/lib/organization-requests";
import { canActForChild, recordChildAudit } from "@/lib/child-access";
import {
  DELEGATE_SCOPE_LABELS,
  delegateEligibility,
  delegateGrantInputError,
  delegateGrantRightsError,
  delegateInviteAcceptBlock,
  delegateGrantState,
  delegateInviteAcceptError,
  delegateInviteExpiresAt,
  delegateInviteIsSelf,
  delegateInviteRateLimitError,
  delegateInviteState,
  delegateRequestView,
  isValidDelegateEmail,
  looksLikeDelegateToken,
  maskContact,
  normalizeDelegateEmail,
  parseDelegateScopes,
  type DelegateScope,
  type DelegateScopes,
  type GuardianGrantRights,
} from "@/lib/household-delegate-policy";

// Trusted household delegates: invite, accept, edit, pause, revoke, and the
// delegate's own view of the children they help with. Permission checks for
// rides live in child-access.ts.

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export function delegateTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function scopeLabels(scopes: DelegateScopes) {
  const map: Record<DelegateScope, boolean> = {
    request_rides: scopes.requestRides,
    approve_rides: scopes.approveRides,
    view_ride_details: scopes.viewRideDetails,
    receive_notifications: scopes.receiveNotifications,
  };
  return (Object.keys(map) as DelegateScope[]).filter(key => map[key]).map(key => DELEGATE_SCOPE_LABELS[key]);
}

function scopesFromRow(row: any): DelegateScopes {
  return {
    requestRides: Boolean(row.can_request_rides),
    approveRides: Boolean(row.can_approve_rides),
    viewRideDetails: Boolean(row.can_view_ride_details),
    receiveNotifications: Boolean(row.can_receive_notifications),
  };
}

function cleanLabel(value: unknown) {
  const label = String(value ?? "").trim().slice(0, 80);
  return label || null;
}

function parseEndsAt(value: unknown) {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

/** The household this adult manages. Only household managers who are adults can manage delegates. */
async function managedHouseholdFor(identity: SessionIdentity) {
  if (identity.supportMode) throw new Error("Support View cannot change trusted adults");
  if (identity.personType !== "adult") throw new Error("Only a parent or guardian can manage trusted adults");
  const db = dbRequired();
  const result = await db.query(
    `select h.id,h.name from household_members hm join households h on h.id=hm.household_id
      where hm.person_id=$1 and hm.can_manage_household=true and h.status='active'
      order by hm.created_at limit 1`,
    [identity.personId]
  );
  if (!result.rowCount) throw new Error("You do not manage an active household");
  return result.rows[0] as { id: string; name: string };
}

async function householdChildren(householdId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select p.id,coalesce(p.preferred_name,p.display_name) as name
       from household_members hm join people p on p.id=hm.person_id
      where hm.household_id=$1 and p.person_type='minor' and p.status='active'
      order by hm.created_at`,
    [householdId]
  );
  return result.rows as { id: string; name: string }[];
}

async function householdManagerIds(householdId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select hm.person_id from household_members hm join people p on p.id=hm.person_id and p.status='active'
      where hm.household_id=$1 and hm.can_manage_household=true`,
    [householdId]
  );
  return result.rows.map((row: any) => String(row.person_id));
}

/**
 * The inviter's own guardian rights for each child. Only a guardian
 * relationship counts, never the inviter's own delegate grant elsewhere.
 * No organization is passed on purpose: canActForChild refuses every delegate
 * grant without one, and only `via === "guardian"` is read here.
 */
async function guardianGrantRights(personId: string, childIds: string[]) {
  const rights: Record<string, GuardianGrantRights> = {};
  for (const childId of childIds) {
    const request = await canActForChild(personId, childId, "request_rides");
    const approve = await canActForChild(personId, childId, "approve_rides");
    const view = await canActForChild(personId, childId, "view_ride_details");
    rights[childId] = {
      guardian: view.via === "guardian",
      requestRides: request.via === "guardian",
      approveRides: approve.via === "guardian",
    };
  }
  return rights;
}

async function assertCanGrant(personId: string, input: { scopes: DelegateScopes; childScope: unknown; childIds: string[] }, children: Array<{ id: string; name: string }>) {
  const error = delegateGrantRightsError(input, children, await guardianGrantRights(personId, children.map(child => child.id)));
  if (error) throw new Error(error);
}

/** Every email (lowercased) and phone lookup hash on a person's account, verified or not. */
async function contactKeysForPerson(client: any, personId: string) {
  const emails = (await client.query(`select normalized_email from emails where person_id=$1`, [personId])).rows.map((row: any) => String(row.normalized_email));
  const phones = (await client.query(`select lookup_hash from phones where person_id=$1`, [personId])).rows.map((row: any) => String(row.lookup_hash));
  return { emails, phones };
}

/** Cancel open invitations in this household addressed to any of this person's contacts. */
async function cancelOpenInvitesForPerson(client: any, input: { householdId: string; personId: string; byPersonId: string; exceptInvitationId?: string | null }) {
  const keys = await contactKeysForPerson(client, input.personId);
  const result = await client.query(
    `update household_delegate_invitations set revoked_at=now(),revoked_by_person_id=$2
      where household_id=$1 and accepted_at is null and revoked_at is null
        and ($5::uuid is null or id<>$5::uuid)
        and ((contact_type='email' and normalized_email=any($3::text[])) or (contact_type='phone' and phone_lookup_hash=any($4::text[])))
      returning id`,
    [input.householdId, input.byPersonId, keys.emails, keys.phones, input.exceptInvitationId || null]
  );
  return result.rows.map((row: any) => String(row.id));
}

async function notifyPeople(personIds: string[], input: { title: string; body: string; url: string }) {
  await Promise.allSettled(Array.from(new Set(personIds)).map(personId => queueNotification({
    notificationType: "household_delegate_activity",
    title: input.title,
    body: input.body,
    personId,
    url: input.url,
  })));
}

async function householdAudit(input: { actorPersonId: string; action: string; householdId: string; delegateId?: string | null; metadata?: Record<string, unknown>; client?: any }) {
  await recordChildAudit({
    client: input.client,
    actorPersonId: input.actorPersonId,
    onBehalfOfPersonId: null,
    action: input.action,
    targetType: input.delegateId ? "household_delegate" : "household",
    targetId: input.delegateId || input.householdId,
    metadata: { householdId: input.householdId, ...(input.metadata || {}) },
  });
}

// ---------------------------------------------------------------------------
// Guardian side

export async function getHouseholdDelegates(identity: SessionIdentity) {
  const household = await managedHouseholdFor(identity);
  const db = dbRequired();
  const children = await householdChildren(household.id);
  const delegates = await db.query(
    `select hd.*,coalesce(p.preferred_name,p.display_name) as delegate_name,
            coalesce(array(select hdc.child_person_id from household_delegate_children hdc where hdc.delegate_id=hd.id),'{}'::uuid[]) as child_ids
       from household_delegates hd join people p on p.id=hd.delegate_person_id
      where hd.household_id=$1
      order by (hd.status='revoked'),hd.created_at desc
      limit 100`,
    [household.id]
  );
  const invitations = await db.query(
    `select id,contact_type,contact_hint,relationship_label,expires_at,accepted_at,revoked_at,created_at,
            can_request_rides,can_approve_rides,can_view_ride_details,can_receive_notifications,child_scope,child_person_ids,ends_at
       from household_delegate_invitations
      where household_id=$1 and accepted_at is null
      order by created_at desc limit 50`,
    [household.id]
  );
  const childIds = children.map(child => child.id);
  const history = await db.query(
    `select a.action,a.occurred_at,a.target_type,a.metadata,
            coalesce(actor.preferred_name,actor.display_name) as actor_name,
            coalesce(child.preferred_name,child.display_name) as child_name
       from audit_events a
       left join people actor on actor.id=a.actor_person_id
       left join people child on child.id=a.on_behalf_of_person_id
      where (a.action like 'household_delegate.%' and a.metadata->>'householdId'=$1::text)
         or (a.action like 'household_delegate.%' and a.on_behalf_of_person_id=any($2::uuid[]))
      order by a.occurred_at desc limit 50`,
    [household.id, childIds]
  );
  // Ride requests waiting for a parent's OK, for example ones a trusted adult asked for.
  const pending = childIds.length ? await db.query(
    `select rr.id,rr.organization_id,rr.passenger_person_id,rr.requested_pickup_at,rr.created_at,e.title as event_title,
            coalesce(o.display_name,o.name) as organization_name,coalesce(c.preferred_name,c.display_name) as child_name,
            coalesce(rq.preferred_name,rq.display_name) as requester_name
       from ride_requests rr join organizations o on o.id=rr.organization_id
       join people c on c.id=rr.passenger_person_id join people rq on rq.id=rr.requester_person_id
       left join events e on e.id=rr.event_id
      where rr.passenger_person_id=any($1::uuid[]) and rr.status='pending_approval'
      order by rr.created_at limit 50`,
    [childIds]
  ) : { rows: [] as any[] };
  const pendingApprovals: any[] = [];
  for (const row of pending.rows) {
    const decision = await canActForChild(identity, row.passenger_person_id, "approve_rides", { organizationId: row.organization_id });
    if (decision.allowed) pendingApprovals.push(row);
  }
  const now = new Date();
  return {
    household,
    children,
    pendingApprovals,
    delegates: delegates.rows.map((row: any) => ({
      id: row.id,
      name: row.delegate_name,
      relationshipLabel: row.relationship_label,
      status: row.status,
      state: delegateGrantState({ status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }, now),
      scopes: scopesFromRow(row),
      childScope: row.child_scope,
      childIds: (row.child_ids || []).map(String),
      endsAt: row.ends_at,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    })),
    invitations: invitations.rows.map((row: any) => ({
      id: row.id,
      contactType: row.contact_type,
      contactHint: row.contact_hint,
      relationshipLabel: row.relationship_label,
      scopes: scopesFromRow(row),
      childScope: row.child_scope,
      childIds: (row.child_person_ids || []).map(String),
      endsAt: row.ends_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      state: delegateInviteState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at }, now),
    })),
    history: history.rows.map((row: any) => ({
      action: row.action,
      occurredAt: row.occurred_at,
      actorName: row.actor_name || "Someone",
      childName: row.child_name || null,
      delegateName: row.metadata?.delegateName || null,
    })),
  };
}

export async function createDelegateInvitation(identity: SessionIdentity, input: {
  contactType: unknown;
  contact: unknown;
  relationshipLabel?: unknown;
  scopes: Record<string, unknown> | null | undefined;
  childScope: unknown;
  childIds?: unknown;
  endsAt?: unknown;
}) {
  const household = await managedHouseholdFor(identity);
  const db = dbRequired();
  const children = await householdChildren(household.id);
  const scopes = parseDelegateScopes(input.scopes);
  const childScope = input.childScope === "selected" ? "selected" : input.childScope === "all" ? "all" : input.childScope;
  const childIds = childScope === "selected" && Array.isArray(input.childIds) ? Array.from(new Set(input.childIds.map(String))) : [];
  const inputError = delegateGrantInputError({ scopes, childScope, childIds, endsAt: input.endsAt }, children.map(child => child.id));
  if (inputError) throw new Error(inputError);
  await assertCanGrant(identity.personId, { scopes, childScope, childIds }, children);
  const endsAt = parseEndsAt(input.endsAt);

  let normalizedEmail: string | null = null;
  let phoneHash: string | null = null;
  let contactHint: string;
  if (input.contactType === "email") {
    if (!isValidDelegateEmail(input.contact)) throw new Error("Enter a valid email address");
    normalizedEmail = normalizeDelegateEmail(input.contact);
    const own = await verifiedEmailsForPerson(identity.personId);
    if (delegateInviteIsSelf({ contactType: "email", normalizedEmail, ownEmails: own, ownPhoneLookupHashes: [] })) throw new Error("You cannot invite yourself");
    contactHint = maskContact("email", normalizedEmail);
  } else if (input.contactType === "phone") {
    const phone = normalizePhoneInput(String(input.contact ?? ""));
    if (!phone) throw new Error("Enter a valid mobile number");
    phoneHash = lookupHash(phone);
    // Any phone on the inviter's own account counts, verified or not.
    const ownPhones = (await contactKeysForPerson(db, identity.personId)).phones;
    if (delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: phoneHash, ownEmails: [], ownPhoneLookupHashes: ownPhones })) throw new Error("You cannot invite yourself");
    contactHint = maskContact("phone", phone);
  } else {
    throw new Error("Choose email or phone");
  }

  const recent = await db.query(
    `select count(*) filter (where invited_by_person_id=$1 and created_at>now()-interval '1 hour')::int as inviter_count,
            count(*) filter (where household_id=$2 and created_at>now()-interval '1 day')::int as household_count
       from household_delegate_invitations
      where created_at>now()-interval '1 day' and (invited_by_person_id=$1 or household_id=$2)`,
    [identity.personId, household.id]
  );
  const limitError = delegateInviteRateLimitError({
    inviterLastHour: Number(recent.rows[0]?.inviter_count || 0),
    householdLastDay: Number(recent.rows[0]?.household_count || 0),
  });
  if (limitError) throw new Error(limitError);

  const token = crypto.randomBytes(32).toString("base64url");
  const client = await db.connect();
  let invitation: any;
  try {
    await client.query("BEGIN");
    // A new invite to the same contact replaces any still-open one.
    await client.query(
      `update household_delegate_invitations set revoked_at=now(),revoked_by_person_id=$2
        where household_id=$1 and accepted_at is null and revoked_at is null
          and ((contact_type='email' and normalized_email=$3) or (contact_type='phone' and phone_lookup_hash=$4))`,
      [household.id, identity.personId, normalizedEmail, phoneHash]
    );
    invitation = (await client.query(
      `insert into household_delegate_invitations
         (household_id,invited_by_person_id,contact_type,normalized_email,phone_lookup_hash,contact_hint,relationship_label,token_hash,
          can_request_rides,can_approve_rides,can_view_ride_details,can_receive_notifications,child_scope,child_person_ids,ends_at,expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::uuid[],$15,$16)
       returning id,expires_at,created_at`,
      [household.id, identity.personId, input.contactType, normalizedEmail, phoneHash, contactHint, cleanLabel(input.relationshipLabel), delegateTokenHash(token),
       scopes.requestRides, scopes.approveRides, scopes.viewRideDetails, scopes.receiveNotifications, childScope, childIds, endsAt, delegateInviteExpiresAt()]
    )).rows[0];
    await householdAudit({
      client,
      actorPersonId: identity.personId,
      action: "household_delegate.invited",
      householdId: household.id,
      metadata: { invitationId: invitation.id, contactType: input.contactType, scopes, childScope, childIds, endsAt },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const inviteUrl = `${appBaseUrl()}/household-invite/${token}`;
  let emailSent = false;
  if (normalizedEmail) {
    try {
      const result = await sendEmailNotification({
        to: normalizedEmail,
        subject: `${identity.displayName} added you as a trusted adult on BandWagon`,
        body: [
          `${identity.displayName} would like you to help with their family's rides on BandWagon.`,
          "",
          "You would be able to:",
          ...scopeLabels(scopes).map(label => `- ${label}`),
          "",
          `Accept here: ${inviteUrl}`,
          "",
          `Sign in with this email address (${normalizedEmail}) to accept. The link works once and expires in 7 days.`,
          "If you were not expecting this, you can ignore it.",
        ].join("\n"),
        notificationType: "household_delegate_invitation",
        urgency: "important",
        correlationId: `household-delegate-invitation:${invitation.id}`,
      });
      emailSent = Boolean(result.ok);
    } catch {
      emailSent = false;
    }
  }
  // We never text a number that has not agreed to texts from BandWagon, so
  // phone invites (and email invites when email is not set up) return the
  // link for the guardian to share. It still only works for the invited person.
  return { invitation: { ...invitation, contactHint, state: "active" }, emailSent, inviteUrl: emailSent ? null : inviteUrl };
}

export async function cancelDelegateInvitation(identity: SessionIdentity, invitationId: string) {
  const household = await managedHouseholdFor(identity);
  const db = dbRequired();
  const updated = await db.query(
    `update household_delegate_invitations set revoked_at=now(),revoked_by_person_id=$3
      where id=$1 and household_id=$2 and accepted_at is null and revoked_at is null returning id`,
    [invitationId, household.id, identity.personId]
  );
  if (!updated.rowCount) throw new Error("This invitation is no longer open");
  await householdAudit({ actorPersonId: identity.personId, action: "household_delegate.invitation_canceled", householdId: household.id, metadata: { invitationId } });
}

async function loadGrantForGuardian(client: any, householdId: string, delegateId: string) {
  const result = await client.query(
    `select hd.*,coalesce(p.preferred_name,p.display_name) as delegate_name
       from household_delegates hd join people p on p.id=hd.delegate_person_id
      where hd.id=$1 and hd.household_id=$2 for update of hd`,
    [delegateId, householdId]
  );
  if (!result.rowCount) throw new Error("Trusted adult not found");
  return result.rows[0];
}

export async function updateDelegate(identity: SessionIdentity, input: {
  delegateId: string;
  relationshipLabel?: unknown;
  scopes: Record<string, unknown> | null | undefined;
  childScope: unknown;
  childIds?: unknown;
  endsAt?: unknown;
}) {
  const household = await managedHouseholdFor(identity);
  const children = await householdChildren(household.id);
  const scopes = parseDelegateScopes(input.scopes);
  const childScope = input.childScope;
  const childIds = childScope === "selected" && Array.isArray(input.childIds) ? Array.from(new Set(input.childIds.map(String))) : [];
  const inputError = delegateGrantInputError({ scopes, childScope, childIds, endsAt: input.endsAt }, children.map(child => child.id));
  if (inputError) throw new Error(inputError);
  await assertCanGrant(identity.personId, { scopes, childScope, childIds }, children);
  const endsAt = parseEndsAt(input.endsAt);
  const db = dbRequired();
  const client = await db.connect();
  let grant: any;
  try {
    await client.query("BEGIN");
    grant = await loadGrantForGuardian(client, household.id, input.delegateId);
    if (grant.status === "revoked") throw new Error("This trusted adult was removed. Send a new invitation instead.");
    await client.query(
      `update household_delegates set can_request_rides=$2,can_approve_rides=$3,can_view_ride_details=$4,can_receive_notifications=$5,
              child_scope=$6,ends_at=$7,relationship_label=$8,updated_at=now()
        where id=$1`,
      [grant.id, scopes.requestRides, scopes.approveRides, scopes.viewRideDetails, scopes.receiveNotifications, childScope, endsAt, cleanLabel(input.relationshipLabel)]
    );
    await client.query(`delete from household_delegate_children where delegate_id=$1`, [grant.id]);
    for (const childId of childIds) {
      await client.query(`insert into household_delegate_children (delegate_id,child_person_id) values ($1,$2)`, [grant.id, childId]);
    }
    await householdAudit({
      client,
      actorPersonId: identity.personId,
      action: "household_delegate.updated",
      householdId: household.id,
      delegateId: grant.id,
      metadata: {
        delegateName: grant.delegate_name,
        before: { scopes: scopesFromRow(grant), childScope: grant.child_scope, endsAt: grant.ends_at },
        after: { scopes, childScope, childIds, endsAt },
      },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  await notifyPeople([grant.delegate_person_id], {
    title: "Your permissions changed",
    body: `${identity.displayName} changed what you can do for their family on BandWagon.`,
    url: "/app/household",
  });
}

export async function setDelegateStatus(identity: SessionIdentity, input: { delegateId: string; status: "active" | "paused" | "revoked" }) {
  if (!["active", "paused", "revoked"].includes(input.status)) throw new Error("Unknown status");
  const household = await managedHouseholdFor(identity);
  const db = dbRequired();
  const client = await db.connect();
  let grant: any;
  try {
    await client.query("BEGIN");
    grant = await loadGrantForGuardian(client, household.id, input.delegateId);
    if (grant.status === "revoked") throw new Error("This trusted adult was already removed");
    if (input.status === "revoked") {
      await client.query(
        `update household_delegates set status='revoked',revoked_at=now(),revoked_by_person_id=$2,updated_at=now() where id=$1`,
        [grant.id, identity.personId]
      );
    } else {
      await client.query(
        // paused_at is kept after resuming so older invitations stay unusable.
        `update household_delegates set status=$2,paused_at=case when $2='paused' then now() else paused_at end,updated_at=now() where id=$1`,
        [grant.id, input.status]
      );
    }
    // A second open invite (say email and phone) must not bring access back.
    const canceledInvitationIds = input.status === "active" ? [] : await cancelOpenInvitesForPerson(client, { householdId: household.id, personId: grant.delegate_person_id, byPersonId: identity.personId });
    const action = input.status === "revoked" ? "household_delegate.revoked" : input.status === "paused" ? "household_delegate.paused" : "household_delegate.resumed";
    await householdAudit({ client, actorPersonId: identity.personId, action, householdId: household.id, delegateId: grant.id, metadata: { delegateName: grant.delegate_name, previousStatus: grant.status, canceledInvitationIds } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const body = input.status === "revoked"
    ? `${identity.displayName} removed your trusted adult access for their family.`
    : input.status === "paused"
      ? `${identity.displayName} paused your trusted adult access for their family.`
      : `${identity.displayName} turned your trusted adult access back on.`;
  await notifyPeople([grant.delegate_person_id], { title: "Trusted adult access changed", body, url: "/app/household" });
}

// ---------------------------------------------------------------------------
// Invitee side

export async function previewDelegateInvitation(token: string) {
  if (!looksLikeDelegateToken(token)) return null;
  const db = dbRequired();
  const result = await db.query(
    `select i.*,coalesce(p.preferred_name,p.display_name) as inviter_name
       from household_delegate_invitations i
       join households h on h.id=i.household_id and h.status='active'
       left join people p on p.id=i.invited_by_person_id
      where i.token_hash=$1 limit 1`,
    [delegateTokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  const scopes = scopesFromRow(row);
  return {
    inviterName: row.inviter_name || "A parent",
    contactType: row.contact_type,
    contactHint: row.contact_hint,
    permissions: scopeLabels(scopes),
    childCount: row.child_scope === "selected" ? (row.child_person_ids || []).length : null,
    endsAt: row.ends_at,
    expiresAt: row.expires_at,
    state: delegateInviteState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at }),
  };
}

export async function acceptDelegateInvitation(identity: SessionIdentity, token: string) {
  if (identity.supportMode) throw new Error("Support View cannot accept invitations");
  if (!looksLikeDelegateToken(token)) throw new Error("This invitation link is not valid");
  const db = dbRequired();
  const client = await db.connect();
  let accepted: { delegateId: string; householdId: string; inviterId: string | null; householdName: string };
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `select i.*,h.name as household_name from household_delegate_invitations i
         join households h on h.id=i.household_id and h.status='active'
        where i.token_hash=$1 for update of i`,
      [delegateTokenHash(token)]
    );
    const invite = found.rows[0];
    if (!invite) throw new Error("This invitation link is not valid");
    const acceptError = delegateInviteAcceptError(delegateInviteState({ expiresAt: invite.expires_at, acceptedAt: invite.accepted_at, revokedAt: invite.revoked_at }));
    if (acceptError) throw new Error(acceptError);

    // Fresh eligibility: adult, active account, verified contact.
    const person = (await client.query(
      `select p.person_type,p.age_band,p.status as person_status,ua.status as account_status,
              exists(select 1 from emails e where e.person_id=p.id and e.verified_at is not null)
                or exists(select 1 from phones ph where ph.person_id=p.id and ph.verified_at is not null) as has_verified_contact
         from people p join user_accounts ua on ua.person_id=p.id where p.id=$1`,
      [identity.personId]
    )).rows[0];
    const eligibility = delegateEligibility({
      personType: person?.person_type,
      ageBand: person?.age_band,
      personStatus: person?.person_status,
      accountStatus: person?.account_status,
      hasVerifiedContact: Boolean(person?.has_verified_contact),
    });
    if (!eligibility.eligible) throw new Error(eligibility.reason || "You cannot accept this invitation");

    if (invite.contact_type === "email") {
      const emails = await verifiedEmailsForPerson(identity.personId);
      if (!emails.includes(invite.normalized_email)) throw new Error(`This invitation was sent to ${invite.contact_hint}. Sign in with that email to accept it.`);
    } else {
      const phone = await client.query(
        `select 1 from phones where person_id=$1 and lookup_hash=$2 and verified_at is not null limit 1`,
        [identity.personId, invite.phone_lookup_hash]
      );
      if (!phone.rowCount) throw new Error(`This invitation was sent to ${invite.contact_hint}. Sign in with that verified phone number to accept it.`);
    }

    const member = await client.query(`select 1 from household_members where household_id=$1 and person_id=$2`, [invite.household_id, identity.personId]);
    if (member.rowCount) throw new Error("You are already part of this household");

    // Keep only children who are still minors in the household.
    const stillChildren = (await client.query(
      `select p.id from household_members hm join people p on p.id=hm.person_id
        where hm.household_id=$1 and p.person_type='minor' and p.status='active' and p.id=any($2::uuid[])`,
      [invite.household_id, invite.child_person_ids || []]
    )).rows.map((row: any) => String(row.id));
    if (invite.child_scope === "selected" && !stillChildren.length) throw new Error("The children on this invitation are no longer in the household. Ask for a new invitation.");

    // Lock every grant for this household and person, including removed ones.
    const grants = (await client.query(
      `select id,status,paused_at,revoked_at from household_delegates where household_id=$1 and delegate_person_id=$2 for update`,
      [invite.household_id, identity.personId]
    )).rows;
    const live = grants.find((row: any) => row.status !== "revoked") || null;
    const latest = (key: "paused_at" | "revoked_at") => grants.map((row: any) => row[key]).filter(Boolean).sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const inviterStillManages = Boolean(invite.invited_by_person_id) && Boolean((await client.query(
      `select 1 from household_members hm join people p on p.id=hm.person_id and p.status='active'
        where hm.household_id=$1 and hm.person_id=$2 and hm.can_manage_household=true`,
      [invite.household_id, invite.invited_by_person_id]
    )).rowCount);
    const block = delegateInviteAcceptBlock({
      inviteCreatedAt: invite.created_at,
      inviterStillManages,
      liveGrantStatus: live?.status || null,
      lastPausedAt: latest("paused_at"),
      lastRevokedAt: latest("revoked_at"),
    });
    if (block) throw new Error(block);
    // The inviter must still hold every permission they are handing out.
    const coveredChildren = (await client.query(
      `select p.id,coalesce(p.preferred_name,p.display_name) as name from household_members hm join people p on p.id=hm.person_id
        where hm.household_id=$1 and p.person_type='minor' and p.status='active'`,
      [invite.household_id]
    )).rows.map((row: any) => ({ id: String(row.id), name: String(row.name) }));
    const rightsError = delegateGrantRightsError(
      { scopes: scopesFromRow(invite), childScope: invite.child_scope, childIds: stillChildren },
      coveredChildren,
      await guardianGrantRights(invite.invited_by_person_id, coveredChildren.map((child: { id: string }) => child.id))
    );
    if (rightsError) throw new Error("The person who invited you can no longer give these permissions. Ask for a new invitation.");

    let delegateId: string;
    if (live) {
      delegateId = live.id;
      await client.query(
        `update household_delegates set status='active',can_request_rides=$2,can_approve_rides=$3,can_view_ride_details=$4,
                can_receive_notifications=$5,child_scope=$6,ends_at=$7,relationship_label=coalesce($8,relationship_label),
                invited_by_person_id=$9,starts_at=now(),updated_at=now()
          where id=$1`,
        [delegateId, invite.can_request_rides, invite.can_approve_rides, invite.can_view_ride_details, invite.can_receive_notifications,
         invite.child_scope, invite.ends_at, invite.relationship_label, invite.invited_by_person_id]
      );
      await client.query(`delete from household_delegate_children where delegate_id=$1`, [delegateId]);
    } else {
      delegateId = (await client.query(
        `insert into household_delegates
           (household_id,delegate_person_id,invited_by_person_id,relationship_label,status,can_request_rides,can_approve_rides,
            can_view_ride_details,can_receive_notifications,child_scope,starts_at,ends_at)
         values ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,now(),$10) returning id`,
        [invite.household_id, identity.personId, invite.invited_by_person_id, invite.relationship_label, invite.can_request_rides,
         invite.can_approve_rides, invite.can_view_ride_details, invite.can_receive_notifications, invite.child_scope, invite.ends_at]
      )).rows[0].id;
    }
    if (invite.child_scope === "selected") {
      for (const childId of stillChildren) {
        await client.query(`insert into household_delegate_children (delegate_id,child_person_id) values ($1,$2) on conflict do nothing`, [delegateId, childId]);
      }
    }
    // Single use: this update only succeeds once because of the row lock and state check above.
    await client.query(
      `update household_delegate_invitations set accepted_at=now(),accepted_by_person_id=$2,delegate_id=$3 where id=$1 and accepted_at is null and revoked_at is null`,
      [invite.id, identity.personId, delegateId]
    );
    // Any other open invite to this person for this household is now spent.
    await cancelOpenInvitesForPerson(client, { householdId: invite.household_id, personId: identity.personId, byPersonId: identity.personId, exceptInvitationId: invite.id });
    await householdAudit({
      client,
      actorPersonId: identity.personId,
      action: "household_delegate.accepted",
      householdId: invite.household_id,
      delegateId,
      metadata: { invitationId: invite.id, delegateName: identity.displayName },
    });
    await client.query("COMMIT");
    accepted = { delegateId, householdId: invite.household_id, inviterId: invite.invited_by_person_id, householdName: invite.household_name };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const managers = await householdManagerIds(accepted.householdId);
  await notifyPeople([...(accepted.inviterId ? [accepted.inviterId] : []), ...managers].filter(id => id !== identity.personId), {
    title: "A trusted adult joined",
    body: `${identity.displayName} accepted your invitation and can now help with your family's rides.`,
    url: "/app/household",
  });
  return { delegateId: accepted.delegateId, householdName: accepted.householdName };
}

/** A delegate can step away from a family at any time. */
export async function leaveDelegation(identity: SessionIdentity, delegateId: string) {
  if (identity.supportMode) throw new Error("Support View cannot change trusted adults");
  const db = dbRequired();
  const updated = await db.query(
    `update household_delegates set status='revoked',revoked_at=now(),revoked_by_person_id=$2,updated_at=now()
      where id=$1 and delegate_person_id=$2 and status<>'revoked' returning household_id`,
    [delegateId, identity.personId]
  );
  if (!updated.rowCount) throw new Error("Trusted adult access not found");
  const householdId = updated.rows[0].household_id;
  await cancelOpenInvitesForPerson(db, { householdId, personId: identity.personId, byPersonId: identity.personId });
  await householdAudit({ actorPersonId: identity.personId, action: "household_delegate.left", householdId, delegateId, metadata: { delegateName: identity.displayName } });
  await notifyPeople(await householdManagerIds(householdId), {
    title: "A trusted adult stepped away",
    body: `${identity.displayName} is no longer a trusted adult for your family.`,
    url: "/app/household",
  });
}

// ---------------------------------------------------------------------------
// Delegate's own view: only the children and rides they are allowed to see.

export async function getDelegateOverview(identity: SessionIdentity) {
  const db = dbRequired();
  const grants = await db.query(
    `select hd.*,h.name as household_name,
            coalesce(array(select hdc.child_person_id from household_delegate_children hdc where hdc.delegate_id=hd.id),'{}'::uuid[]) as child_ids
       from household_delegates hd join households h on h.id=hd.household_id and h.status='active'
      where hd.delegate_person_id=$1 and hd.status<>'revoked'
      order by h.name`,
    [identity.personId]
  );
  const families: any[] = [];
  for (const grant of grants.rows) {
    const state = delegateGrantState({ status: grant.status, startsAt: grant.starts_at, endsAt: grant.ends_at });
    const members = await db.query(
      `select p.id,coalesce(p.preferred_name,p.display_name) as name
         from household_members hm join people p on p.id=hm.person_id
        where hm.household_id=$1 and p.person_type='minor' and p.status='active'
          and ($2='all' or p.id=any($3::uuid[]))
        order by hm.created_at`,
      [grant.household_id, grant.child_scope, grant.child_ids || []]
    );
    const children: any[] = [];
    for (const child of members.rows) {
      const entry: any = { id: child.id, name: child.name, organizations: [], requests: [], rides: [], pendingApprovals: [] };
      if (state === "active") {
        // Organizations the child belongs to that allow delegates, with upcoming events, only when requesting is allowed.
        if (grant.can_request_rides) {
          const orgs = await db.query(
            `select o.id,coalesce(o.display_name,o.name) as name from memberships m join organizations o on o.id=m.organization_id
              where m.person_id=$1 and m.group_id is null and m.status='active' and o.status='active' and o.household_delegates_enabled=true
              order by name`,
            [child.id]
          );
          for (const org of orgs.rows) {
            const decision = await canActForChild(identity, child.id, "request_rides", { organizationId: org.id });
            if (!decision.allowed) continue;
            const events = await db.query(
              `select id,title,starts_at from events where organization_id=$1 and status='active' and ride_coordination_enabled=true
                 and coalesce(starts_at,now())>=now()-interval '1 day' and coalesce(starts_at,now())<now()+interval '60 days'
               order by starts_at nulls last limit 50`,
              [org.id]
            );
            entry.organizations.push({ id: org.id, name: org.name, events: events.rows });
          }
        }
        const canView = grant.can_view_ride_details || grant.can_request_rides || grant.can_approve_rides;
        if (canView) {
          const requests = await db.query(
            `select rr.id,rr.public_ref,rr.organization_id,rr.requester_person_id,rr.status,rr.direction,rr.guardian_approval_status,rr.requested_pickup_at,rr.pickup_note,
                    e.title as event_title,e.starts_at as event_starts_at,coalesce(o.display_name,o.name) as organization_name,
                    pl.generalized_area as pickup_area,
                    coalesce((select json_agg(json_build_object('id',ro.id,'driverName',dp.display_name,'seatsOffered',ro.seats_offered,'proposedPickupAt',ro.proposed_pickup_at) order by ro.created_at)
                              from ride_offers ro join people dp on dp.id=ro.driver_person_id where ro.ride_request_id=rr.id and ro.status='offered'),'[]'::json) as offers
               from ride_requests rr join organizations o on o.id=rr.organization_id
               left join events e on e.id=rr.event_id
               left join private_locations pl on pl.id=rr.pickup_location_id
              where rr.passenger_person_id=$1 and rr.status in ('pending_approval','open','matched')
              order by coalesce(rr.requested_pickup_at,e.starts_at,rr.created_at) limit 50`,
            [child.id]
          );
          for (const request of requests.rows) {
            const view = await canActForChild(identity, child.id, "view_ride_details", { organizationId: request.organization_id });
            const approve = await canActForChild(identity, child.id, "approve_rides", { organizationId: request.organization_id });
            const manage = await canActForChild(identity, child.id, "manage_ride_request", { organizationId: request.organization_id });
            // The creator's id is only used to decide what to show. It is never sent to the page.
            const { requester_person_id: requesterPersonId, ...visible } = request;
            if (approve.allowed && request.status === "pending_approval") entry.pendingApprovals.push(visible);
            // With "See ride details": the full row. Without it, a delegate who can ask
            // for rides still sees a short status view of the requests they created.
            const shown = delegateRequestView({
              request,
              viewAllowed: view.allowed,
              manageAllowed: manage.allowed,
              createdByViewer: String(requesterPersonId) === identity.personId,
            });
            if (shown) entry.requests.push(shown);
          }
          const rides = await db.query(
            `select r.id,r.public_ref,r.organization_id,r.status,r.scheduled_pickup_at,d.display_name as driver_name,
                    e.title as event_title,e.starts_at as event_starts_at,pl.generalized_area as pickup_area,
                    dp.vehicle_label,dp.vehicle_color
               from ride_passengers rp join rides r on r.id=rp.ride_id
               join ride_requests rr on rr.id=rp.ride_request_id
               join people d on d.id=r.driver_person_id
               left join driver_profiles dp on dp.person_id=r.driver_person_id
               left join events e on e.id=r.event_id
               left join private_locations pl on pl.id=rr.pickup_location_id
              where rp.person_id=$1 and rp.assignment_status='confirmed' and r.status in ('confirmed','driver_en_route','arrived','picked_up')
              order by coalesce(r.scheduled_pickup_at,e.starts_at,r.created_at) limit 50`,
            [child.id]
          );
          for (const ride of rides.rows) {
            const view = await canActForChild(identity, child.id, "view_ride_details", { organizationId: ride.organization_id });
            if (!view.allowed) continue;
            const manage = await canActForChild(identity, child.id, "manage_ride_request", { organizationId: ride.organization_id });
            entry.rides.push({ ...ride, canManage: manage.allowed });
          }
        }
      }
      children.push(entry);
    }
    families.push({
      delegateId: grant.id,
      householdName: grant.household_name,
      state,
      endsAt: grant.ends_at,
      permissions: scopeLabels(scopesFromRow(grant)),
      scopes: scopesFromRow(grant),
      children,
    });
  }
  return { families };
}
