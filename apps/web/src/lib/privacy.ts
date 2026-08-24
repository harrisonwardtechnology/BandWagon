import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { decryptSensitive } from "@/lib/data-security";
import { sendEmailNotification } from "@/lib/email-send";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionGraceDays,
  isAccountDeletionConfirmation,
} from "@/lib/privacy-policy";

export type PrivacyBlocker = {
  key: string;
  message: string;
  count?: number;
  items?: string[];
};

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function assertDirectUserAction(identity: SessionIdentity) {
  if (identity.supportMode) {
    throw new Error("Support View cannot export or delete another user's data");
  }
}

function decryptOrNull(value: unknown) {
  if (!value || value === "deleted") return null;
  try {
    return decryptSensitive(String(value));
  } catch {
    return null;
  }
}

async function verifiedEmail(personId: string) {
  const result = await dbRequired().query(
    `select normalized_email from emails
      where person_id=$1 and verified_at is not null
      order by verified_at desc limit 1`,
    [personId]
  );
  return result.rows[0]?.normalized_email as string | undefined;
}

export async function getAccountDeletionBlockers(
  identity: Pick<SessionIdentity, "personId" | "userAccountId">,
  queryable: any = dbRequired()
) {
  const [activeRides, openRequests, orgOwnership, guardianDuties, householdDuties, platformOwner, safetyAlerts] = await Promise.all([
    queryable.query(
      `select distinct r.public_ref
         from rides r
        where r.status in ('confirmed','driver_en_route','arrived','picked_up')
          and (
            r.driver_person_id=$1
            or exists(select 1 from ride_passengers rp where rp.ride_id=r.id and rp.person_id=$1 and rp.assignment_status='confirmed')
            or exists(select 1 from ride_request_assignments a join ride_requests rr on rr.id=a.ride_request_id
                       where a.ride_id=r.id and a.status='confirmed' and rr.requester_person_id=$1)
          )`,
      [identity.personId]
    ),
    queryable.query(
      `select distinct public_ref from ride_requests
        where status in ('draft','pending_approval','open','matched')
          and (
            requester_person_id=$1 or passenger_person_id=$1
            or pickup_location_id in(select id from private_locations where owner_person_id=$1)
            or dropoff_location_id in(select id from private_locations where owner_person_id=$1)
          )`,
      [identity.personId]
    ),
    queryable.query(
      `select coalesce(o.display_name,o.name) as name
         from memberships m join organizations o on o.id=m.organization_id
        where m.person_id=$1 and m.group_id is null and m.status='active' and m.role='owner'
          and not exists(
            select 1 from memberships other
             where other.organization_id=m.organization_id and other.person_id<>m.person_id
               and other.group_id is null and other.status='active' and other.role='owner'
          )`,
      [identity.personId]
    ),
    queryable.query(
      `select p.display_name
         from guardian_relationships gr join people p on p.id=gr.minor_person_id and p.status='active'
        where gr.guardian_person_id=$1 and gr.can_manage_profile=true
          and not exists(
            select 1 from guardian_relationships other join people op on op.id=other.guardian_person_id and op.status='active'
             where other.minor_person_id=gr.minor_person_id and other.guardian_person_id<>gr.guardian_person_id
               and other.can_manage_profile=true
          )`,
      [identity.personId]
    ),
    queryable.query(
      `select coalesce(h.name,'Household') as name
         from household_members me join households h on h.id=me.household_id
        where me.person_id=$1 and me.can_manage_household=true
          and exists(select 1 from household_members member join people p on p.id=member.person_id and p.status='active'
                      where member.household_id=me.household_id and member.person_id<>me.person_id)
          and not exists(select 1 from household_members manager join people p on p.id=manager.person_id and p.status='active'
                          where manager.household_id=me.household_id and manager.person_id<>me.person_id
                            and manager.can_manage_household=true)`,
      [identity.personId]
    ),
    queryable.query(
      `select 1 from user_accounts ua
        where ua.id=$1 and ua.platform_role='owner'
          and not exists(select 1 from user_accounts other
                          where other.id<>ua.id and other.status='active' and other.platform_role='owner')`,
      [identity.userAccountId]
    ),
    queryable.query(
      `select id from safety_alerts
        where triggered_by_person_id=$1 and status in ('open','acknowledged')`,
      [identity.personId]
    ),
  ]);

  const blockers: PrivacyBlocker[] = [];
  if (activeRides.rowCount) blockers.push({ key: "active_rides", count: activeRides.rowCount, message: "Complete or cancel active rides before deleting your account." });
  if (openRequests.rowCount) blockers.push({ key: "open_ride_requests", count: openRequests.rowCount, message: "Resolve open ride requests that involve you or one of your saved locations before deleting your account." });
  if (orgOwnership.rowCount) blockers.push({ key: "organization_owner", count: orgOwnership.rowCount, items: orgOwnership.rows.map((row: any) => row.name), message: "Transfer organization ownership to another active owner first." });
  if (guardianDuties.rowCount) blockers.push({ key: "sole_guardian", count: guardianDuties.rowCount, items: guardianDuties.rows.map((row: any) => row.display_name), message: "Assign another profile-managing guardian for managed minors first." });
  if (householdDuties.rowCount) blockers.push({ key: "sole_household_manager", count: householdDuties.rowCount, items: householdDuties.rows.map((row: any) => row.name), message: "Assign another household manager or remove the remaining managed profiles first." });
  if (platformOwner.rowCount) blockers.push({ key: "last_platform_owner", message: "Grant another account the platform owner role before deleting this account." });
  if (safetyAlerts.rowCount) blockers.push({ key: "open_safety_alerts", count: safetyAlerts.rowCount, message: "Resolve open safety alerts before deleting your account." });
  return blockers;
}

export async function privacyStatus(identity: SessionIdentity) {
  assertDirectUserAction(identity);
  const db = dbRequired();
  const requests = await db.query(
    `select id,request_type,status,scheduled_for,blockers,requested_at,completed_at,cancelled_at,last_error
       from privacy_requests
      where person_id=$1 or user_account_id=$2
      order by requested_at desc limit 20`,
    [identity.personId,identity.userAccountId]
  );
  return {
    requests: requests.rows,
    deletionBlockers: await getAccountDeletionBlockers(identity, db),
  };
}

export async function buildMyDataExport(identity: SessionIdentity) {
  assertDirectUserAction(identity);
  const db = dbRequired();
  const request = await db.query(
    `insert into privacy_requests(request_type,person_id,user_account_id,status,processing_started_at)
     values('export',$1,$2,'processing',now()) returning id`,
    [identity.personId,identity.userAccountId]
  );
  const requestId = request.rows[0].id;
  await db.query(
    `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type)
     values($1,$2,'requested')`,
    [requestId,identity.personId]
  );

  try {
    const [profile, emails, phones, household, guardians, memberships, rideRequests, rideOffers, rides, locations, documents, preferences, deliveries, safety, consents, activity, authEvents, privacyRequests] = await Promise.all([
      db.query(
        `select p.id,p.display_name,p.preferred_name,p.person_type,p.profile_bio,p.birth_month,p.birth_year,
                p.age_band,p.student_approval_required,p.rider_preferences,p.created_at,p.updated_at,
                ua.created_at as account_created_at,ua.last_login_at,ua.product_preferences
           from people p join user_accounts ua on ua.person_id=p.id
          where p.id=$1 and ua.id=$2`,
        [identity.personId,identity.userAccountId]
      ),
      db.query(`select normalized_email,verified_at,visibility,created_at from emails where person_id=$1 order by created_at`, [identity.personId]),
      db.query(`select e164_ciphertext,verified_at,visibility,messaging_consent_status,created_at from phones where person_id=$1 order by created_at`, [identity.personId]),
      db.query(
        `select h.public_ref,h.name,h.status,hm.household_role,hm.can_manage_household,hm.created_at
           from household_members hm join households h on h.id=hm.household_id
          where hm.person_id=$1 order by hm.created_at`,
        [identity.personId]
      ),
      db.query(
        `select case when gr.guardian_person_id=$1 then 'guardian' else 'minor' end as my_role,
                other.display_name as related_person,gr.relationship_label,gr.can_approve_rides,gr.can_manage_profile,gr.require_verified_pickup,gr.created_at
           from guardian_relationships gr
           join people other on other.id=case when gr.guardian_person_id=$1 then gr.minor_person_id else gr.guardian_person_id end
          where gr.guardian_person_id=$1 or gr.minor_person_id=$1`,
        [identity.personId]
      ),
      db.query(
        `select coalesce(o.display_name,o.name) as organization,o.slug,m.role,m.status,m.membership_source,m.created_at,m.updated_at
           from memberships m join organizations o on o.id=m.organization_id
          where m.person_id=$1 order by m.created_at`,
        [identity.personId]
      ),
      db.query(
        `select rr.public_ref,coalesce(o.display_name,o.name) as organization,e.title as event,
                rr.direction,rr.seats_needed,rr.pickup_note,rr.dropoff_note,rr.requested_pickup_at,
                rr.requested_dropoff_at,rr.guardian_approval_status,rr.status,rr.cancelled_reason,rr.created_at,rr.updated_at
           from ride_requests rr join organizations o on o.id=rr.organization_id left join events e on e.id=rr.event_id
          where rr.requester_person_id=$1 or rr.passenger_person_id=$1 order by rr.created_at`,
        [identity.personId]
      ),
      db.query(
        `select rr.public_ref as ride_request_ref,ro.seats_offered,ro.note,ro.proposed_pickup_at,ro.status,ro.created_at,ro.updated_at
           from ride_offers ro join ride_requests rr on rr.id=ro.ride_request_id
          where ro.driver_person_id=$1 order by ro.created_at`,
        [identity.personId]
      ),
      db.query(
        `select distinct r.public_ref,coalesce(o.display_name,o.name) as organization,e.title as event,r.status,
                r.scheduled_pickup_at,r.driver_arrived_at,r.picked_up_at,r.completed_at,r.cancelled_at,r.created_at,r.updated_at,
                (r.driver_person_id=$1) as was_driver
           from rides r join organizations o on o.id=r.organization_id left join events e on e.id=r.event_id
          where r.driver_person_id=$1 or exists(select 1 from ride_passengers rp where rp.ride_id=r.id and rp.person_id=$1)
          order by r.created_at`,
        [identity.personId]
      ),
      db.query(
        `select id,label,address_ciphertext,latitude_ciphertext,longitude_ciphertext,generalized_area,
                generalized_latitude,generalized_longitude,reveal_policy,status,created_at,updated_at,
                exact_data_delete_after,exact_data_deleted_at
           from private_locations where owner_person_id=$1 order by created_at`,
        [identity.personId]
      ),
      db.query(
        `select id,document_type,status,original_filename,content_type,size_bytes,issued_at,expires_at,
                extracted_metadata,uploaded_at,deleted_at,created_at,updated_at
           from person_documents where person_id=$1 order by created_at`,
        [identity.personId]
      ),
      db.query(`select * from notification_preferences where person_id=$1 order by created_at`, [identity.personId]),
      db.query(
        `select notification_type,channel,destination_ref,status,urgency,estimated_cost_cents,created_at,delivered_at,failed_at
           from notification_deliveries where person_id=$1 order by created_at`,
        [identity.personId]
      ),
      db.query(
        `select alert_type,status,message,generalized_area,metadata,created_at,updated_at,resolved_at
           from safety_alerts where triggered_by_person_id=$1 order by created_at`,
        [identity.personId]
      ),
      db.query(
        `select case when guardian_person_id=$1 then 'guardian' else 'minor' end as my_role,
                consent_type,status,granted_at,revoked_at,metadata,created_at
           from guardian_consents where guardian_person_id=$1 or minor_person_id=$1 order by created_at`,
        [identity.personId]
      ),
      db.query(`select activity_type,metadata,occurred_at from user_activity_events where person_id=$1 order by occurred_at`, [identity.personId]),
      db.query(`select event_type,outcome,metadata,occurred_at from auth_events where person_id=$1 order by occurred_at`, [identity.personId]),
      db.query(
        `select id,request_type,status,scheduled_for,requested_at,completed_at,cancelled_at
           from privacy_requests where person_id=$1 order by requested_at`,
        [identity.personId]
      ),
    ]);

    const exportData = {
      schemaVersion: "bandwagon-user-export-v1",
      generatedAt: new Date().toISOString(),
      profile: profile.rows[0] || null,
      contacts: {
        emails: emails.rows,
        phones: phones.rows.map((row: any) => ({ ...row, phone: decryptOrNull(row.e164_ciphertext), e164_ciphertext: undefined })),
      },
      household: household.rows,
      guardianRelationships: guardians.rows,
      memberships: memberships.rows,
      rideRequests: rideRequests.rows,
      rideOffers: rideOffers.rows,
      rides: rides.rows,
      privateLocations: locations.rows.map((row: any) => ({
        ...row,
        address: decryptOrNull(row.address_ciphertext),
        latitude: decryptOrNull(row.latitude_ciphertext),
        longitude: decryptOrNull(row.longitude_ciphertext),
        address_ciphertext: undefined,
        latitude_ciphertext: undefined,
        longitude_ciphertext: undefined,
      })),
      credentialDocuments: documents.rows,
      notificationPreferences: preferences.rows,
      notificationDeliveries: deliveries.rows,
      safetyAlerts: safety.rows,
      guardianConsents: consents.rows,
      activityEvents: activity.rows,
      authenticationEvents: authEvents.rows,
      privacyRequests: privacyRequests.rows,
      notes: [
        "Credential document binaries are not embedded in this JSON export. Active documents remain available through the Credential Vault until deleted.",
        "Minimum de-identified security, safety, billing, and audit records may be retained under BandWagon policy.",
      ],
    };

    await db.query(
      `update privacy_requests set status='completed',completed_at=now(),updated_at=now() where id=$1`,
      [requestId]
    );
    await db.query(
      `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type,metadata)
       values($1,$2,'exported',$3::jsonb)`,
      [requestId,identity.personId,JSON.stringify({ schemaVersion: exportData.schemaVersion })]
    );
    await db.query(
      `insert into audit_events(actor_person_id,action,target_type,target_id,metadata)
       values($1,'privacy.data_exported','person',$1,$2::jsonb)`,
      [identity.personId,JSON.stringify({ privacyRequestId: requestId })]
    );
    return exportData;
  } catch (error) {
    await db.query(
      `update privacy_requests set status='failed',last_error=$2,updated_at=now() where id=$1`,
      [requestId,error instanceof Error ? error.message.slice(0,1000) : "Export failed"]
    ).catch(() => undefined);
    throw error;
  }
}

export async function requestAccountDeletion(identity: SessionIdentity, confirmation: string) {
  assertDirectUserAction(identity);
  if (!isAccountDeletionConfirmation(confirmation)) {
    throw new Error(`Type "${ACCOUNT_DELETION_CONFIRMATION}" exactly to schedule deletion`);
  }
  const db = dbRequired();
  const client = await db.connect();
  let requestRow: any;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`bandwagon:privacy:${identity.userAccountId}`]);
    const existing = await client.query(
      `select id,status,scheduled_for from privacy_requests
        where user_account_id=$1 and request_type='delete_account'
          and status in ('requested','processing','scheduled','blocked','failed')
        order by requested_at desc limit 1 for update`,
      [identity.userAccountId]
    );
    if (existing.rowCount) throw new Error("An account deletion request is already active");
    const blockers = await getAccountDeletionBlockers(identity, client);
    if (blockers.length) {
      await client.query("rollback");
      return { scheduled: false, blockers };
    }
    const graceDays = accountDeletionGraceDays(process.env.ACCOUNT_DELETION_GRACE_DAYS, 7);
    const result = await client.query(
      `insert into privacy_requests(request_type,person_id,user_account_id,status,scheduled_for,metadata)
       values('delete_account',$1,$2,'scheduled',now()+($3||' days')::interval,$4::jsonb)
       returning id,status,scheduled_for,requested_at`,
      [identity.personId,identity.userAccountId,String(graceDays),JSON.stringify({ graceDays })]
    );
    requestRow = result.rows[0];
    await client.query(
      `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type,metadata)
       values($1,$2,'scheduled',$3::jsonb)`,
      [requestRow.id,identity.personId,JSON.stringify({ scheduledFor: requestRow.scheduled_for })]
    );
    await client.query(
      `insert into audit_events(actor_person_id,action,target_type,target_id,metadata)
       values($1,'privacy.account_deletion_scheduled','user_account',$2,$3::jsonb)`,
      [identity.personId,identity.userAccountId,JSON.stringify({ privacyRequestId: requestRow.id,scheduledFor: requestRow.scheduled_for })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const email = await verifiedEmail(identity.personId);
  if (email) {
    await sendEmailNotification({
      to: email,
      subject: "BandWagon account deletion scheduled",
      body: `Your BandWagon account is scheduled for deletion on ${new Date(requestRow.scheduled_for).toLocaleDateString("en-US")}. Sign in and open Privacy & Data before then if you want to cancel.`,
      notificationType: "account_deletion_scheduled",
      urgency: "important",
      personId: identity.personId,
    }).catch(() => undefined);
  }
  return { scheduled: true, request: requestRow, blockers: [] };
}

export async function cancelAccountDeletion(identity: SessionIdentity, requestId: string) {
  assertDirectUserAction(identity);
  const db = dbRequired();
  const result = await db.query(
    `update privacy_requests
        set status='cancelled',cancelled_at=now(),last_error=null,updated_at=now()
      where id=$1 and person_id=$2 and user_account_id=$3 and request_type='delete_account'
        and status in ('requested','scheduled','blocked','failed')
      returning id,status,cancelled_at`,
    [requestId,identity.personId,identity.userAccountId]
  );
  if (!result.rowCount) throw new Error("Deletion request cannot be cancelled or was not found");
  await db.query(
    `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type)
     values($1,$2,'cancelled')`,
    [requestId,identity.personId]
  );
  await db.query(
    `insert into audit_events(actor_person_id,action,target_type,target_id,metadata)
     values($1,'privacy.account_deletion_cancelled','user_account',$2,$3::jsonb)`,
    [identity.personId,identity.userAccountId,JSON.stringify({ privacyRequestId: requestId })]
  );
  return result.rows[0];
}
