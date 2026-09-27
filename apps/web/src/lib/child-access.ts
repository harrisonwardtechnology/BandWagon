import { getDb } from "@/lib/db";
import { queueNotification } from "@/lib/notification-queue";
import {
  evaluateChildAccess,
  type ChildAccessDecision,
  type ChildAction,
  type DelegateGrant,
} from "@/lib/household-delegate-policy";

// The single place that decides whether a person may act for a child.
// Guardians, trusted household delegates, and the child themself all go
// through canActForChild. It always reads fresh rows, so pausing or revoking
// a delegate takes effect on the next request without waiting for a session
// to expire.

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

function dbRequired(): Queryable {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db as unknown as Queryable;
}

function actorId(actor: string | { personId: string }) {
  return typeof actor === "string" ? actor : actor.personId;
}

function toGrant(row: any): DelegateGrant {
  return {
    id: row.id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    scopes: {
      requestRides: Boolean(row.can_request_rides),
      approveRides: Boolean(row.can_approve_rides),
      viewRideDetails: Boolean(row.can_view_ride_details),
      receiveNotifications: Boolean(row.can_receive_notifications),
    },
    childScope: row.child_scope,
    childIds: (row.child_ids || []).map(String),
    delegateIsAdult: Boolean(row.delegate_is_adult),
    delegateActive: Boolean(row.delegate_active),
    householdActive: Boolean(row.household_active),
    childInHousehold: Boolean(row.child_in_household),
    childIsMinor: Boolean(row.child_is_minor),
  };
}

const DELEGATE_GRANT_SELECT = `
  select hd.id,hd.household_id,hd.delegate_person_id,hd.status,hd.starts_at,hd.ends_at,
         hd.can_request_rides,hd.can_approve_rides,hd.can_view_ride_details,hd.can_receive_notifications,
         hd.child_scope,
         coalesce(array(select hdc.child_person_id from household_delegate_children hdc where hdc.delegate_id=hd.id),'{}'::uuid[]) as child_ids,
         (dp.person_type='adult' and coalesce(dp.age_band,'unknown') not in ('13_17','under_13')) as delegate_is_adult,
         (dp.status='active' and exists(select 1 from user_accounts ua where ua.person_id=dp.id and ua.status='active')) as delegate_active,
         (h.status='active') as household_active,
         exists(select 1 from household_members hm where hm.household_id=hd.household_id and hm.person_id=c.id) as child_in_household,
         (c.person_type='minor' and c.status='active') as child_is_minor
    from household_delegates hd
    join people dp on dp.id=hd.delegate_person_id
    join households h on h.id=hd.household_id
    join people c on c.id=$1::uuid
   where hd.status<>'revoked'
     and exists(select 1 from household_members hm2 where hm2.household_id=hd.household_id and hm2.person_id=$1::uuid)`;

async function organizationAllowsDelegates(db: Queryable, organizationId: string | null | undefined) {
  if (!organizationId) return null;
  const result = await db.query(`select household_delegates_enabled from organizations where id=$1`, [organizationId]);
  if (!result.rowCount) return false;
  return result.rows[0].household_delegates_enabled !== false;
}

/**
 * May `actor` perform `action` for `childId`? Pass organizationId whenever the
 * action happens inside an organization so its delegate setting is respected.
 * Pass `client` when running inside a transaction.
 */
export async function canActForChild(
  actor: string | { personId: string },
  childId: string,
  action: ChildAction,
  options: { organizationId?: string | null; client?: Queryable } = {}
): Promise<ChildAccessDecision> {
  const db = options.client || dbRequired();
  const personId = actorId(actor);
  if (!personId || !childId) return { allowed: false, via: null, delegateId: null, reason: "Missing person" };
  const guardianResult = await db.query(
    `select can_approve_rides,can_manage_profile from guardian_relationships where guardian_person_id=$1 and minor_person_id=$2 limit 1`,
    [personId, childId]
  );
  const guardianRow = guardianResult.rows[0];
  const guardian = guardianRow ? { canApproveRides: Boolean(guardianRow.can_approve_rides), canManageProfile: Boolean(guardianRow.can_manage_profile) } : null;
  const quick = evaluateChildAccess({ actorIsChild: personId === childId, guardian, delegates: [], childId, action });
  if (quick.allowed) return quick;
  const delegateRows = await db.query(`${DELEGATE_GRANT_SELECT} and hd.delegate_person_id=$2::uuid`, [childId, personId]);
  const delegates = delegateRows.rows.map(toGrant);
  const orgAllows = delegates.length ? await organizationAllowsDelegates(db, options.organizationId) : null;
  return evaluateChildAccess({
    actorIsChild: personId === childId,
    guardian,
    delegates,
    childId,
    action,
    organizationAllowsDelegates: orgAllows,
  });
}

export async function assertCanActForChild(
  actor: string | { personId: string },
  childId: string,
  action: ChildAction,
  options: { organizationId?: string | null; client?: Queryable; message?: string } = {}
) {
  const decision = await canActForChild(actor, childId, action, options);
  if (!decision.allowed) throw new Error(options.message || decision.reason);
  return decision;
}

/** Guardians of a child (people with a guardian relationship). */
export async function guardianIdsForChild(childId: string, client?: Queryable) {
  const db = client || dbRequired();
  const result = await db.query(
    `select gr.guardian_person_id from guardian_relationships gr join people p on p.id=gr.guardian_person_id and p.status='active' where gr.minor_person_id=$1`,
    [childId]
  );
  return result.rows.map((row: any) => String(row.guardian_person_id));
}

/** Delegates who currently may receive notifications about this child's rides. */
export async function delegateNotificationRecipients(childId: string, organizationId: string | null, client?: Queryable) {
  const db = client || dbRequired();
  const rows = await db.query(`${DELEGATE_GRANT_SELECT} and hd.can_receive_notifications=true`, [childId]);
  if (!rows.rowCount) return [];
  const orgAllows = await organizationAllowsDelegates(db, organizationId);
  const people = new Set<string>();
  for (const row of rows.rows) {
    const decision = evaluateChildAccess({
      actorIsChild: false,
      guardian: null,
      delegates: [toGrant(row)],
      childId,
      action: "receive_notifications",
      organizationAllowsDelegates: orgAllows,
    });
    if (decision.allowed) people.add(String(row.delegate_person_id));
  }
  return Array.from(people);
}

/** Send a ride notification to delegates allowed to receive them for this child. Never throws. */
export async function notifyChildDelegates(input: {
  childId: string;
  organizationId: string | null;
  notificationType: string;
  title: string;
  body: string;
  url?: string;
  excludePersonIds?: string[];
}) {
  try {
    const recipients = (await delegateNotificationRecipients(input.childId, input.organizationId))
      .filter(id => !(input.excludePersonIds || []).includes(id));
    await Promise.allSettled(recipients.map(personId => queueNotification({
      notificationType: input.notificationType,
      title: input.title,
      body: input.body,
      personId,
      organizationId: input.organizationId,
      url: input.url || "/app/household",
    })));
  } catch {
    // Notifications are best effort and never block the ride action.
  }
}

/** Audit row for something done for a child. actor = who acted, on_behalf_of = the child. */
export async function recordChildAudit(input: {
  client?: Queryable;
  organizationId?: string | null;
  actorPersonId: string;
  onBehalfOfPersonId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = input.client || dbRequired();
  await db.query(
    `insert into audit_events (organization_id,actor_person_id,on_behalf_of_person_id,action,target_type,target_id,metadata)
     values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::text,$7::jsonb)`,
    [input.organizationId || null, input.actorPersonId, input.onBehalfOfPersonId, input.action, input.targetType, input.targetId, JSON.stringify(input.metadata || {})]
  );
}

const DELEGATE_ACTION_TEXT: Record<string, { audit: string; title: string; body: (name: string, child: string) => string }> = {
  requested: { audit: "household_delegate.ride_requested", title: "A trusted adult asked for a ride", body: (name, child) => `${name} asked for a ride for ${child}.` },
  approved: { audit: "household_delegate.ride_approved", title: "A trusted adult approved a ride", body: (name, child) => `${name} approved a ride request for ${child}.` },
  denied: { audit: "household_delegate.ride_denied", title: "A trusted adult declined a ride", body: (name, child) => `${name} declined a ride request for ${child}.` },
  accepted_offer: { audit: "household_delegate.offer_accepted", title: "A trusted adult confirmed a ride", body: (name, child) => `${name} accepted a driver's offer for ${child}.` },
  cancelled: { audit: "household_delegate.ride_cancelled", title: "A trusted adult cancelled a ride", body: (name, child) => `${name} cancelled a ride for ${child}.` },
  managed: { audit: "household_delegate.ride_updated", title: "A trusted adult updated a ride", body: (name, child) => `${name} updated a ride for ${child}.` },
};

/**
 * After a delegate acts for a child: write the audit row and tell the child's
 * guardians. Does nothing when the decision did not come from a delegate grant.
 */
export async function afterDelegateRideAction(input: {
  decision: ChildAccessDecision | null | undefined;
  kind: keyof typeof DELEGATE_ACTION_TEXT;
  actorPersonId: string;
  childId: string;
  organizationId: string | null;
  targetType: "ride_request" | "ride";
  targetId: string;
  url?: string;
}) {
  if (!input.decision || input.decision.via !== "delegate") return;
  const text = DELEGATE_ACTION_TEXT[input.kind];
  const db = dbRequired();
  try {
    await recordChildAudit({
      organizationId: input.organizationId,
      actorPersonId: input.actorPersonId,
      onBehalfOfPersonId: input.childId,
      action: text.audit,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { delegateId: input.decision.delegateId },
    });
  } catch {
    // Audit failures are surfaced by monitoring; the ride action already happened.
  }
  try {
    const names = await db.query(
      `select (select coalesce(preferred_name,display_name) from people where id=$1) as actor_name,
              (select coalesce(preferred_name,display_name) from people where id=$2) as child_name`,
      [input.actorPersonId, input.childId]
    );
    const actorName = names.rows[0]?.actor_name || "A trusted adult";
    const childName = names.rows[0]?.child_name || "your child";
    const guardians = (await guardianIdsForChild(input.childId)).filter(id => id !== input.actorPersonId);
    await Promise.allSettled(guardians.map(personId => queueNotification({
      notificationType: "household_delegate_activity",
      title: text.title,
      body: text.body(actorName, childName),
      personId,
      organizationId: input.organizationId,
      url: input.url || "/app/rides",
    })));
  } catch {
    // Best effort.
  }
}
