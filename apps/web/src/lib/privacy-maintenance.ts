import { getDb } from "@/lib/db";
import { deletePrivateObject } from "@/lib/object-storage";
import { getAccountDeletionBlockers } from "@/lib/privacy";
import { sendEmailNotification } from "@/lib/email-send";
import { sessionIdleDays } from "@/lib/auth-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function purgeDocumentObjects(limit = 100) {
  const db = dbRequired();
  const documents = await db.query(
    `select id,storage_key from person_documents
      where status='deleted' and storage_deleted_at is null
        and delete_after is not null and delete_after<=now()
      order by delete_after limit $1`,
    [Math.max(1,Math.min(500,limit))]
  );
  const results: Array<{ id: string; deleted: boolean; error?: string }> = [];
  for (const document of documents.rows) {
    try {
      await deletePrivateObject(document.storage_key);
      await db.query(
        `update person_documents
            set storage_deleted_at=now(),storage_delete_error=null,
                storage_key='deleted/'||id::text,updated_at=now()
          where id=$1`,
        [document.id]
      );
      results.push({ id: document.id, deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0,1000) : "Storage deletion failed";
      await db.query(
        `update person_documents set storage_delete_error=$2,updated_at=now() where id=$1`,
        [document.id,message]
      ).catch(() => undefined);
      results.push({ id: document.id, deleted: false, error: message });
    }
  }
  return results;
}

async function scheduleExpiredCredentialDeletion() {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `with retention as (
       select pd.id,pd.status,pd.expires_at,pd.created_at,pd.updated_at,
              coalesce(max(o.credential_retention_days),90)::int as retention_days
         from person_documents pd
         left join memberships m on m.person_id=pd.person_id and m.status='active' and m.group_id is null
         left join organizations o on o.id=m.organization_id
        where pd.status in ('pending_upload','uploaded','ready','rejected','replaced')
        group by pd.id
     )
     update person_documents pd
        set status='deleted',deletion_requested_at=coalesce(deletion_requested_at,now()),
            delete_after=coalesce(delete_after,now()),deleted_at=coalesce(deleted_at,now()),
            original_filename=null,content_type=null,size_bytes=null,sha256=null,
            issued_at=null,expires_at=null,extracted_metadata='{}'::jsonb,updated_at=now()
       from retention r
      where pd.id=r.id and (
        (r.expires_at is not null and r.expires_at < current_date-r.retention_days)
        or (r.status in ('rejected','replaced') and r.updated_at < now()-make_interval(days=>r.retention_days))
        or (r.status='pending_upload' and r.created_at < now()-interval '24 hours')
      )
       returning pd.id`
    );
    if (result.rowCount) {
      const documentIds = result.rows.map((row: any) => row.id);
      await client.query(
        `update driver_requirement_status s
          set status='not_submitted',document_id=null,reviewed_by_person_id=null,reviewed_at=null,
              notes=null,metadata='{}'::jsonb,updated_at=now()
        where document_id=any($1::uuid[])`,
        [documentIds]
      );
      await client.query(
        `update ai_jobs
          set document_id=null,person_id=null,input_metadata='{}'::jsonb,result_json='{}'::jsonb,
              provider_request_id=null,error_message=null,updated_at=now()
        where document_id=any($1::uuid[])`,
        [documentIds]
      );
      await client.query(
        `insert into document_access_events(document_id,access_type,purpose,metadata)
       select unnest($1::uuid[]),'delete','retention_policy','{"scheduled":true}'::jsonb`,
        [documentIds]
      );
    }
    await client.query("commit");
    return result.rowCount || 0;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function purgeExpiredExactLocations(limit = 250) {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `update private_locations
        set address_ciphertext='deleted',latitude_ciphertext=null,longitude_ciphertext=null,
            exact_data_deleted_at=now(),updated_at=now()
      where id in (
        select id from private_locations
         where exact_data_delete_after is not null and exact_data_delete_after<=now()
           and exact_data_deleted_at is null
         order by exact_data_delete_after limit $1
         for update skip locked
      )
      returning id`,
      [Math.max(1,Math.min(1000,limit))]
    );
    if (result.rowCount) {
      const locationIds = result.rows.map((row: any) => row.id);
      await client.query(
        `update location_access_events
          set metadata='{"redacted":true}'::jsonb
        where private_location_id=any($1::uuid[])`,
        [locationIds]
      );
      await client.query(
        `update ride_requests
          set pickup_note=case when pickup_location_id=any($1::uuid[]) then null else pickup_note end,
              dropoff_note=case when dropoff_location_id=any($1::uuid[]) then null else dropoff_note end,
              updated_at=now()
        where pickup_location_id=any($1::uuid[]) or dropoff_location_id=any($1::uuid[])`,
        [locationIds]
      );
    }
    await client.query("commit");
    return result.rowCount || 0;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function purgeExpiredAuthArtifacts() {
  const db = dbRequired();
  const idleDays = sessionIdleDays(process.env.SESSION_IDLE_DAYS);
  const [challenges,redactedDeliveries,revokedSessions] = await Promise.all([
    db.query(
      `delete from auth_otp_challenges
        where expires_at<now()-interval '24 hours'
        returning id`
    ),
    db.query(
      `update notification_deliveries
          set destination_ref=null,provider_message_id=null,metadata='{"redacted":true}'::jsonb
        where notification_type='otp' and person_id is null and destination_ref is not null
          and created_at<now()-interval '24 hours'
        returning id`
    ),
    db.query(
      `update auth_sessions
          set revoked_at=coalesce(revoked_at,now())
        where revoked_at is null
          and (expires_at<=now() or last_seen_at<now()-($1||' days')::interval)
        returning id`,
      [String(idleDays)]
    ),
  ]);
  const removedSessions = await db.query(
    `delete from auth_sessions
      where coalesce(revoked_at,expires_at)<now()-interval '30 days'
      returning id`
  );
  return {
    challengesDeleted: challenges.rowCount || 0,
    otpDeliveriesRedacted: redactedDeliveries.rowCount || 0,
    sessionsRevoked: revokedSessions.rowCount || 0,
    sessionsDeleted: removedSessions.rowCount || 0,
  };
}

async function failDeletion(requestId: string, error: unknown) {
  const db = dbRequired();
  const message = error instanceof Error ? error.message.slice(0,1000) : "Account deletion failed";
  await db.query(
    `update privacy_requests
        set status='failed',scheduled_for=now()+interval '1 hour',last_error=$2,updated_at=now()
      where id=$1`,
    [requestId,message]
  );
  await db.query(
    `insert into privacy_request_events(privacy_request_id,event_type,metadata)
     values($1,'failed',$2::jsonb)`,
    [requestId,JSON.stringify({ error: message })]
  ).catch(() => undefined);
  return message;
}

async function blockDeletion(requestId: string, row: any, blockers: unknown[]) {
  const db = dbRequired();
  await db.query(
    `update user_accounts set status='active',updated_at=now() where id=$1 and status='deleting'`,
    [row.user_account_id]
  );
  await db.query(
    `update privacy_requests
        set status='blocked',blockers=$2::jsonb,scheduled_for=now()+interval '1 day',
            last_error='Deletion prerequisites are not yet resolved',updated_at=now()
      where id=$1`,
    [requestId,JSON.stringify(blockers)]
  );
  await db.query(
    `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type,metadata)
     values($1,$2,'blocked',$3::jsonb)`,
    [requestId,row.person_id,JSON.stringify({ blockers })]
  );
  return { completed: false, blocked: true, blockers };
}

async function anonymizeAccount(request: any) {
  const db = dbRequired();
  const account = await db.query(
    `select ua.id as user_account_id,ua.person_id,p.household_id,e.normalized_email
       from user_accounts ua join people p on p.id=ua.person_id
       left join lateral (
         select normalized_email from emails
          where person_id=p.id and verified_at is not null
          order by verified_at desc limit 1
       ) e on true
      where ua.id=$1 and p.id=$2 and ua.status in ('active','deleting') and p.status='active'`,
    [request.user_account_id,request.person_id]
  );
  if (!account.rowCount) {
    await db.query(
      `update privacy_requests set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=$1`,
      [request.id]
    );
    return { completed: true, alreadyRemoved: true };
  }
  const row = account.rows[0];
  const blockers = await getAccountDeletionBlockers(
    { personId: row.person_id, userAccountId: row.user_account_id },
    db
  );
  if (blockers.length) {
    return blockDeletion(request.id,row,blockers);
  }

  const freezeClient = await db.connect();
  try {
    await freezeClient.query("begin");
    await freezeClient.query("select pg_advisory_xact_lock(hashtext($1))", [`bandwagon:privacy:${row.user_account_id}`]);
    const frozen = await freezeClient.query(
      `update user_accounts set status='deleting',updated_at=now()
        where id=$1 and status in ('active','deleting') returning id`,
      [row.user_account_id]
    );
    if (!frozen.rowCount) throw new Error("Account can no longer be prepared for deletion");
    await freezeClient.query("commit");
  } catch (error) {
    await freezeClient.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    freezeClient.release();
  }

  const frozenBlockers = await getAccountDeletionBlockers(
    { personId: row.person_id, userAccountId: row.user_account_id },
    db
  );
  if (frozenBlockers.length) {
    return blockDeletion(request.id,row,frozenBlockers);
  }

  const documents = await db.query(
    `select id,storage_key from person_documents
      where person_id=$1 and storage_deleted_at is null`,
    [row.person_id]
  );
  const storageFailures: string[] = [];
  for (const document of documents.rows) {
    try {
      await deletePrivateObject(document.storage_key);
    } catch (error) {
      storageFailures.push(`${document.id}: ${error instanceof Error ? error.message : "storage deletion failed"}`);
    }
  }
  if (storageFailures.length) {
    throw new Error(`Private document cleanup failed: ${storageFailures.join("; ").slice(0,800)}`);
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`bandwagon:privacy:${row.user_account_id}`]);
    const claimed = await client.query(
      `select 1 from privacy_requests where id=$1 and status='processing' for update`,
      [request.id]
    );
    if (!claimed.rowCount) throw new Error("Deletion request is no longer processing");
    const frozen = await client.query(
      `select 1 from user_accounts where id=$1 and status='deleting' for update`,
      [row.user_account_id]
    );
    if (!frozen.rowCount) throw new Error("Account is not frozen for deletion");

    await client.query(
      `update driver_requirement_status
          set status='not_submitted',document_id=null,reviewed_by_person_id=null,reviewed_at=null,
              expires_at=null,notes=null,metadata='{}'::jsonb,updated_at=now()
        where driver_person_id=$1`,
      [row.person_id]
    );
    await client.query(
      `update ai_jobs
          set person_id=null,document_id=null,input_metadata='{}'::jsonb,result_json='{}'::jsonb,
              provider_request_id=null,error_message=null,updated_at=now()
        where person_id=$1 or document_id in(select id from person_documents where person_id=$1)`,
      [row.person_id]
    );
    await client.query(`update ai_policy_events set person_id=null,metadata='{}'::jsonb where person_id=$1`,[row.person_id]);
    await client.query(
      `update person_documents
          set status='deleted',storage_key='deleted/'||id::text,original_filename=null,content_type=null,
              size_bytes=null,sha256=null,issued_at=null,expires_at=null,extracted_metadata='{}'::jsonb,
              deletion_requested_at=coalesce(deletion_requested_at,now()),delete_after=coalesce(delete_after,now()),
              storage_deleted_at=now(),storage_delete_error=null,deleted_at=coalesce(deleted_at,now()),updated_at=now()
        where person_id=$1`,
      [row.person_id]
    );
    await client.query(
      `update private_locations
          set owner_person_id=null,label=null,address_ciphertext='deleted',latitude_ciphertext=null,
              longitude_ciphertext=null,exact_data_delete_after=coalesce(exact_data_delete_after,now()),
              exact_data_deleted_at=now(),status='archived',updated_at=now()
        where owner_person_id=$1`,
      [row.person_id]
    );
    await client.query(
      `update ride_requests set pickup_note=null,dropoff_note=null,cancelled_reason=null,updated_at=now()
        where requester_person_id=$1 or passenger_person_id=$1`,
      [row.person_id]
    );
    await client.query(`update ride_offers set note=null,updated_at=now() where driver_person_id=$1`, [row.person_id]);
    await client.query(
      `update rides set cancellation_reason=null,no_show_reason=null,updated_at=now()
        where driver_person_id=$1 or exists(select 1 from ride_passengers rp where rp.ride_id=rides.id and rp.person_id=$1)`,
      [row.person_id]
    );
    await client.query(
      `update safety_alerts
          set message=null,latitude_ciphertext=null,longitude_ciphertext=null,generalized_area=null,
              metadata='{"redacted":true}'::jsonb,updated_at=now()
        where triggered_by_person_id=$1`,
      [row.person_id]
    );
    await client.query(`delete from safety_alert_recipients where person_id=$1`, [row.person_id]);
    await client.query(`delete from push_subscriptions where person_id=$1`, [row.person_id]);
    await client.query(`delete from notification_preferences where person_id=$1`, [row.person_id]);
    await client.query(
      `update notification_deliveries
          set person_id=null,destination_ref=null,provider_message_id=null,metadata='{"redacted":true}'::jsonb
        where person_id=$1`,
      [row.person_id]
    );
    await client.query(`delete from ride_reminder_dispatches where person_id=$1`, [row.person_id]);
    await client.query(`delete from match_suggestions where driver_person_id=$1`, [row.person_id]);
    await client.query(`update matching_runs set requested_by_person_id=null,parameters='{}'::jsonb where requested_by_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_ride_recommendations where driver_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_service_zones where driver_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_recurring_availability where driver_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_availability_exceptions where driver_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_organization_settings where driver_person_id=$1`, [row.person_id]);
    await client.query(`delete from driver_profiles where person_id=$1`, [row.person_id]);
    await client.query(`delete from event_intake_drafts where created_by_person_id=$1`, [row.person_id]);
    await client.query(`update event_intake_drafts set reviewed_by_person_id=null where reviewed_by_person_id=$1`, [row.person_id]);
    await client.query(`update events set created_by_person_id=null where created_by_person_id=$1`, [row.person_id]);
    await client.query(`delete from organization_join_events where person_id=$1`, [row.person_id]);
    await client.query(`delete from guardian_consents where guardian_person_id=$1 or minor_person_id=$1`, [row.person_id]);
    await client.query(`delete from guardian_relationships where guardian_person_id=$1 or minor_person_id=$1`, [row.person_id]);
    await client.query(`delete from household_members where person_id=$1`, [row.person_id]);
    await client.query(`delete from memberships where person_id=$1`, [row.person_id]);
    await client.query(`delete from emails where person_id=$1`, [row.person_id]);
    await client.query(`delete from phones where person_id=$1`, [row.person_id]);
    await client.query(`update person_documents set uploaded_by_person_id=null where uploaded_by_person_id=$1`, [row.person_id]);
    await client.query(`update driver_requirement_status set reviewed_by_person_id=null where reviewed_by_person_id=$1`, [row.person_id]);
    await client.query(`update organization_ai_settings set consented_by_person_id=null where consented_by_person_id=$1`, [row.person_id]);
    await client.query(
      `update organization_decommission_members
          set person_display_name='Deleted user',verified_email_snapshot=null,updated_at=now()
        where person_id=$1`,
      [row.person_id]
    );
    await client.query(`delete from auth_otp_challenges where person_id=$1 or user_account_id=$2`, [row.person_id,row.user_account_id]);
    await client.query(
      `update auth_events set user_account_id=null,person_id=null,metadata='{"redacted":true}'::jsonb
        where person_id=$1 or user_account_id=$2`,
      [row.person_id,row.user_account_id]
    );
    await client.query(
      `update account_events set user_account_id=null,person_id=null,metadata='{"redacted":true}'::jsonb
        where person_id=$1 or user_account_id=$2`,
      [row.person_id,row.user_account_id]
    );
    await client.query(
      `update user_activity_events set user_account_id=null,person_id=null,metadata='{"redacted":true}'::jsonb
        where person_id=$1 or user_account_id=$2`,
      [row.person_id,row.user_account_id]
    );
    await client.query(`update audit_events set actor_person_id=null,metadata='{"redacted":true}'::jsonb where actor_person_id=$1`, [row.person_id]);
    await client.query(`update document_access_events set actor_person_id=null,metadata='{"redacted":true}'::jsonb where actor_person_id=$1`, [row.person_id]);
    await client.query(`update location_access_events set actor_person_id=null,metadata='{"redacted":true}'::jsonb where actor_person_id=$1`, [row.person_id]);
    await client.query(`update ride_status_events set actor_person_id=null,metadata='{"redacted":true}'::jsonb where actor_person_id=$1`, [row.person_id]);
    await client.query(`update ride_pickup_handshake_events set actor_person_id=null,metadata='{"redacted":true}'::jsonb where actor_person_id=$1`, [row.person_id]);
    await client.query(`update organization_ai_setting_events set actor_person_id=null where actor_person_id=$1`, [row.person_id]);
    await client.query(
      `update platform_support_sessions
          set status=case when status='active' then 'ended' else status end,
              ended_at=case when status='active' then now() else ended_at end,
              ended_by_user_account_id=null,metadata='{"redacted":true}'::jsonb
        where operator_user_account_id=$1 or target_user_account_id=$1`,
      [row.user_account_id]
    );
    await client.query(
      `update platform_support_session_events
          set request_path=null,request_method=null,metadata='{"redacted":true}'::jsonb
        where operator_user_account_id=$1
           or support_session_id in(
             select id from platform_support_sessions
              where operator_user_account_id=$1 or target_user_account_id=$1
           )`,
      [row.user_account_id]
    );
    await client.query(`delete from user_accounts where id=$1`, [row.user_account_id]);
    await client.query(
      `update people
          set household_id=null,display_name='Deleted user',preferred_name=null,profile_bio=null,
              birth_month=null,birth_year=null,age_band='unknown',age_screened_at=null,student_approval_required=false,
              rider_preferences='{}'::jsonb,status='deleted',updated_at=now()
        where id=$1`,
      [row.person_id]
    );
    if (row.household_id) {
      await client.query(
        `delete from households h where h.id=$1 and not exists(select 1 from household_members hm where hm.household_id=h.id)`,
        [row.household_id]
      );
    }
    await client.query(
      `update privacy_requests
          set user_account_id=null,status='completed',blockers='[]'::jsonb,completed_at=now(),last_error=null,updated_at=now()
        where id=$1`,
      [request.id]
    );
    await client.query(
      `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type,metadata)
       values($1,$2,'completed','{"anonymizedOperationalHistory":true}'::jsonb)`,
      [request.id,row.person_id]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (row.normalized_email) {
    await sendEmailNotification({
      to: row.normalized_email,
      subject: "BandWagon account deletion completed",
      body: "Your BandWagon sign-in account and direct personal information have been removed. Minimum de-identified safety, security, billing, and ride-integrity records may remain under the retention policy.",
      notificationType: "account_deletion_completed",
      urgency: "important",
    }).catch(() => undefined);
  }
  return { completed: true, alreadyRemoved: false };
}

async function processDueAccountDeletions(limit = 10) {
  const db = dbRequired();
  await db.query(
    `update privacy_requests
        set status='failed',scheduled_for=now(),last_error='Recovered an interrupted deletion worker',updated_at=now()
      where request_type='delete_account' and status='processing'
        and processing_started_at<now()-interval '1 hour'`
  );
  const claimed = await db.query(
    `update privacy_requests
        set status='processing',processing_started_at=now(),updated_at=now()
      where id in (
        select id from privacy_requests
         where request_type='delete_account' and status in ('scheduled','blocked','failed')
           and scheduled_for<=now()
         order by scheduled_for limit $1 for update skip locked
      )
      returning *`,
    [Math.max(1,Math.min(50,limit))]
  );
  const results: any[] = [];
  for (const request of claimed.rows) {
    try {
      await db.query(
        `insert into privacy_request_events(privacy_request_id,actor_person_id,event_type)
         values($1,$2,'processing')`,
        [request.id,request.person_id]
      );
      results.push({ id: request.id, ...(await anonymizeAccount(request)) });
    } catch (error) {
      results.push({ id: request.id, completed: false, error: await failDeletion(request.id,error) });
    }
  }
  return results;
}

export async function processPrivacyMaintenance() {
  const expiredCredentialsScheduled = await scheduleExpiredCredentialDeletion();
  const documentCleanup = await purgeDocumentObjects();
  const exactLocationsDeleted = await purgeExpiredExactLocations();
  const authArtifacts = await purgeExpiredAuthArtifacts();
  const accountDeletions = await processDueAccountDeletions();
  const result = {
    expiredCredentialsScheduled,
    documentCleanup,
    exactLocationsDeleted,
    authArtifacts,
    accountDeletions,
  };
  const documentFailures = documentCleanup.filter((item) => !item.deleted).length;
  const accountFailures = accountDeletions.filter((item) => item.error).length;
  if (documentFailures || accountFailures) {
    throw new Error(
      `Privacy maintenance needs retry: ${documentFailures} object cleanup failure(s), ${accountFailures} account deletion failure(s)`
    );
  }
  return result;
}
