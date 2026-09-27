import crypto from "node:crypto";
import type { SessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmailNotification } from "@/lib/email-send";
import {
  ORGANIZATION_AGREEMENT_VERSION,
  ORGANIZATION_TYPES,
  canWithdrawRequest,
  normalizeReviewChecklist,
  normalizeSlug,
  openRequestLimitReached,
  reviewDecisionError,
  tenantSlugError,
  type OrganizationRequestInput,
} from "@/lib/organization-onboarding-policy";
import {
  createOrganizationWithClient,
  isTenantSlugAvailable,
  tenantHostnameForSlug,
} from "@/lib/saas-tenants";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export function appBaseUrl() {
  return (process.env.APP_URL || "https://bandwagon.harrisonward.net").replace(/\/$/, "");
}

export function privateHash(value: string) {
  const secret = process.env.AUTH_SECRET || process.env.DATA_ENCRYPTION_KEY || "bandwagon-organization-requests";
  return crypto.createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

export async function verifiedEmailsForPerson(personId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select normalized_email from emails where person_id=$1 and verified_at is not null order by created_at`,
    [personId]
  );
  return result.rows.map((row: any) => String(row.normalized_email));
}

async function safeSend(input: Parameters<typeof sendEmailNotification>[0]) {
  try {
    return await sendEmailNotification(input);
  } catch (error) {
    return { ok: false, skipped: false, reason: error instanceof Error ? error.message : "Email failed" };
  }
}

export async function checkRequestedSlug(value: string) {
  const slug = normalizeSlug(value);
  const error = tenantSlugError(slug);
  if (error) return { slug, hostname: slug ? tenantHostnameForSlug(slug) : null, available: false, error };
  const db = dbRequired();
  const pending = await db.query(`select 1 from organization_requests where requested_slug=$1 and status='pending' limit 1`, [slug]);
  const available = !pending.rowCount && (await isTenantSlugAvailable(slug));
  return { slug, hostname: tenantHostnameForSlug(slug), available, error: available ? null : "That web address is already taken" };
}

export async function listRequestsForPerson(personId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select r.id,r.organization_name,r.requested_slug,r.status,r.review_notes,r.created_at,r.decided_at,r.organization_id,
            o.tenant_hostname
       from organization_requests r
       left join organizations o on o.id=r.organization_id
      where r.requester_person_id=$1
      order by r.created_at desc
      limit 20`,
    [personId]
  );
  // Rejection notes are written for the requester; other review details stay internal.
  return result.rows.map((row: any) => ({ ...row, review_notes: row.status === "rejected" ? row.review_notes : null }));
}

export async function createOrganizationRequest(identity: SessionIdentity, input: OrganizationRequestInput, sourceIp: string | null) {
  if (identity.supportMode) throw new Error("Support View cannot submit requests");
  const db = dbRequired();
  const open = await db.query(`select count(*)::int as count from organization_requests where requester_person_id=$1 and status='pending'`, [identity.personId]);
  if (openRequestLimitReached(Number(open.rows[0]?.count || 0))) {
    throw new Error("You already have the maximum number of requests waiting for review");
  }
  const slugCheck = await checkRequestedSlug(input.slug);
  if (!slugCheck.available) throw new Error(slugCheck.error || "That web address is not available");

  let row: any;
  try {
    const result = await db.query(
      `insert into organization_requests
        (requester_person_id,requester_user_account_id,organization_name,requested_slug,organization_type,city,state,
         approximate_families,requester_role,sponsoring_organization,website,ride_description,
         agreement_version,agreement_accepted_at,source_ip_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)
       returning *`,
      [
        identity.personId, identity.userAccountId, input.organizationName, input.slug, input.organizationType, input.city, input.state,
        input.approximateFamilies, input.requesterRole, input.sponsoringOrganization, input.website, input.rideDescription,
        ORGANIZATION_AGREEMENT_VERSION, sourceIp ? privateHash(sourceIp) : null,
      ]
    );
    row = result.rows[0];
  } catch (error: any) {
    if (error?.code === "23505") throw new Error("That web address is already taken");
    throw error;
  }

  await db.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values (null,$1,'organization_request.submitted','organization_request',$2,$3::jsonb)`,
    [identity.personId, row.id, JSON.stringify({ slug: row.requested_slug, agreementVersion: ORGANIZATION_AGREEMENT_VERSION })]
  );

  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL || process.env.SUPPORT_EMAIL;
  if (ownerEmail) {
    await safeSend({
      to: ownerEmail,
      subject: `New BandWagon community request: ${row.organization_name}`,
      body: [
        `${identity.displayName} asked to start a community on BandWagon.`,
        "",
        `Organization: ${row.organization_name}`,
        `Type: ${ORGANIZATION_TYPES[row.organization_type as keyof typeof ORGANIZATION_TYPES] || row.organization_type}`,
        `Location: ${row.city}, ${row.state}`,
        `About ${row.approximate_families} families`,
        `Requested address: ${tenantHostnameForSlug(row.requested_slug)}`,
        "",
        `Review it here: ${appBaseUrl()}/admin/organization-requests`,
      ].join("\n"),
      notificationType: "organization_request_submitted",
      urgency: "routine",
      correlationId: `organization-request:${row.id}`,
    });
  }
  return row;
}

export async function withdrawOrganizationRequest(identity: SessionIdentity, requestId: string) {
  if (identity.supportMode) throw new Error("Support View cannot change requests");
  const db = dbRequired();
  const current = await db.query(`select status from organization_requests where id=$1 and requester_person_id=$2`, [requestId, identity.personId]);
  if (!current.rowCount) throw new Error("Request not found");
  if (!canWithdrawRequest(current.rows[0].status)) throw new Error("Only a request waiting for review can be withdrawn");
  await db.query(`update organization_requests set status='withdrawn',decided_at=now(),updated_at=now() where id=$1 and status='pending'`, [requestId]);
  await db.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values (null,$1,'organization_request.withdrawn','organization_request',$2,'{}'::jsonb)`,
    [identity.personId, requestId]
  );
}

export async function listOrganizationRequests(status: string | null) {
  const db = dbRequired();
  const filter = ["pending", "approved", "rejected", "withdrawn"].includes(String(status)) ? status : null;
  const result = await db.query(
    `select r.*,p.display_name as requester_name,
            (select e.normalized_email from emails e where e.person_id=r.requester_person_id and e.verified_at is not null order by e.created_at limit 1) as requester_email,
            reviewer.display_name as reviewer_name,o.tenant_hostname
       from organization_requests r
       join people p on p.id=r.requester_person_id
       left join people reviewer on reviewer.id=r.reviewer_person_id
       left join organizations o on o.id=r.organization_id
      where ($1::text is null or r.status=$1)
      order by (r.status='pending') desc, r.created_at desc
      limit 200`,
    [filter]
  );
  return result.rows;
}

async function lockPendingRequest(client: { query: (...args: any[]) => Promise<any> }, requestId: string) {
  const result = await client.query(`select * from organization_requests where id=$1 for update`, [requestId]);
  if (!result.rowCount) throw new Error("Request not found");
  return result.rows[0];
}

export async function decideOrganizationRequest(
  identity: SessionIdentity,
  input: { requestId: string; decision: "approve" | "reject"; note?: string | null; checklist?: unknown }
) {
  const db = dbRequired();
  const checklist = normalizeReviewChecklist(input.checklist);
  const note = String(input.note || "").trim().slice(0, 2000) || null;
  const client = await db.connect();
  let request: any;
  let organization: any = null;
  try {
    await client.query("begin");
    request = await lockPendingRequest(client, input.requestId);
    const error = reviewDecisionError({ decision: input.decision, status: request.status, note, checklist });
    if (error) throw new Error(error);

    if (input.decision === "approve") {
      organization = await createOrganizationWithClient(client, {
        name: request.organization_name,
        slug: request.requested_slug,
        discoverability: "unlisted",
        actorPersonId: identity.personId,
        metadata: { organizationRequestId: request.id, source: "self_serve_request" },
      });
      await client.query(
        `update organizations
            set settings=settings || $2::jsonb, updated_at=now()
          where id=$1`,
        [organization.id, JSON.stringify({
          onboarding: {
            requestId: request.id,
            organizationType: request.organization_type,
            city: request.city,
            state: request.state,
            approximateFamilies: request.approximate_families,
            sponsoringOrganization: request.sponsoring_organization,
            website: request.website,
            agreementVersion: request.agreement_version,
            agreementAcceptedAt: request.agreement_accepted_at,
          },
        })]
      );
      const membership = await client.query(
        `insert into memberships (organization_id,group_id,person_id,role,status)
         values ($1,null,$2,'owner','active') returning id`,
        [organization.id, request.requester_person_id]
      );
      await client.query(
        `update organization_requests
            set status='approved',reviewer_person_id=$2,review_notes=$3,review_checklist=$4::jsonb,decided_at=now(),organization_id=$5,updated_at=now()
          where id=$1`,
        [request.id, identity.personId, note, JSON.stringify(checklist), organization.id]
      );
      await client.query(
        `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
         values ($1,$2,'organization_request.approved','organization_request',$3,$4::jsonb),
                ($1,$2,'membership.owner_granted','membership',$5,$6::jsonb)`,
        [
          organization.id, identity.personId, request.id, JSON.stringify({ checklist, slug: organization.slug }),
          membership.rows[0].id, JSON.stringify({ personId: request.requester_person_id, role: "owner", source: "organization_request" }),
        ]
      );
    } else {
      await client.query(
        `update organization_requests
            set status='rejected',reviewer_person_id=$2,review_notes=$3,review_checklist=$4::jsonb,decided_at=now(),updated_at=now()
          where id=$1`,
        [request.id, identity.personId, note, JSON.stringify(checklist)]
      );
      await client.query(
        `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
         values (null,$1,'organization_request.rejected','organization_request',$2,$3::jsonb)`,
        [identity.personId, request.id, JSON.stringify({ checklist })]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const [to] = await verifiedEmailsForPerson(request.requester_person_id);
  let emailSent = false;
  if (to) {
    const base = appBaseUrl();
    const body = input.decision === "approve"
      ? [
          `Good news. ${request.organization_name} is now set up on BandWagon.`,
          "",
          `Your community address: https://${organization.tenant_hostname}`,
          `Start here: ${base}/admin/setup?organizationId=${organization.id}`,
          "",
          "The setup checklist walks you through join codes, driver rules, events, and a test ride.",
          ...(note ? ["", `Note from the BandWagon team: ${note}`] : []),
        ].join("\n")
      : [
          `Thanks for your interest in BandWagon. We were not able to approve ${request.organization_name} right now.`,
          "",
          `Reason: ${note}`,
          "",
          `You can see your requests or send a new one here: ${base}/start`,
        ].join("\n");
    const result = await safeSend({
      to,
      subject: input.decision === "approve" ? `${request.organization_name} is ready on BandWagon` : `Update on your BandWagon request`,
      body,
      personId: request.requester_person_id,
      organizationId: organization?.id || null,
      notificationType: input.decision === "approve" ? "organization_request_approved" : "organization_request_rejected",
      urgency: "important",
      correlationId: `organization-request:${request.id}`,
    });
    emailSent = Boolean(result.ok);
  }
  return { organization, emailSent };
}
