import crypto from "node:crypto";
import type { SessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { getDb } from "@/lib/db";
import { sendEmailNotification } from "@/lib/email-send";
import {
  acceptedMembershipRole,
  invitableRoles,
  invitationEmailMatches,
  invitationExpiresAt,
  invitationRoleError,
  invitationState,
  isValidInviteEmail,
  looksLikeInvitationToken,
  normalizeInviteEmail,
  type InvitationRole,
} from "@/lib/organization-invitation-policy";
import { appBaseUrl, verifiedEmailsForPerson } from "@/lib/organization-requests";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

/** Only the sha256 hash of an invitation token is ever stored. */
export function invitationTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newInvitationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

async function inviterAccess(identity: SessionIdentity, organizationId: string, write: boolean) {
  const access = await assertIdentityOrganizationAdmin(identity, organizationId, { write });
  const platformOwner = access.platformAccess && identity.platformRole === "owner";
  return { ...access, platformOwner, roles: invitableRoles(access.organizationRole, { platformOwner }) };
}

export async function listInvitations(identity: SessionIdentity, organizationId: string) {
  const access = await inviterAccess(identity, organizationId, false);
  const db = dbRequired();
  const result = await db.query(
    `select i.id,i.normalized_email,i.role,i.expires_at,i.accepted_at,i.revoked_at,i.created_at,p.display_name as invited_by
       from organization_invitations i
       left join people p on p.id=i.invited_by_person_id
      where i.organization_id=$1
      order by i.created_at desc
      limit 100`,
    [organizationId]
  );
  return {
    invitableRoles: access.roles,
    invitations: result.rows.map((row: any) => ({
      id: row.id,
      email: row.normalized_email,
      role: row.role,
      invitedBy: row.invited_by || null,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      state: invitationState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at }),
    })),
  };
}

export async function createInvitation(identity: SessionIdentity, input: { organizationId: string; email: string; role: unknown }) {
  const access = await inviterAccess(identity, input.organizationId, true);
  const roleError = invitationRoleError(access.organizationRole, input.role, { platformOwner: access.platformOwner });
  if (roleError) throw new Error(roleError);
  const role = input.role as InvitationRole;
  if (!isValidInviteEmail(input.email)) throw new Error("Enter a valid email address");
  const email = normalizeInviteEmail(input.email);
  const db = dbRequired();

  const existing = await db.query(
    `select m.role from emails e
       join memberships m on m.person_id=e.person_id and m.organization_id=$2 and m.group_id is null and m.status='active'
      where e.normalized_email=$1 limit 1`,
    [email, input.organizationId]
  );
  const currentRole = existing.rows[0]?.role || null;
  if (currentRole && acceptedMembershipRole(currentRole, role) === currentRole) {
    throw new Error("That person already has this access or more");
  }

  const token = newInvitationToken();
  const tokenHash = invitationTokenHash(token);
  const client = await db.connect();
  let invitation: any;
  try {
    await client.query("begin");
    // A new invitation replaces any still-open one for the same email.
    await client.query(
      `update organization_invitations set revoked_at=now(),revoked_by_person_id=$3
        where organization_id=$1 and normalized_email=$2 and accepted_at is null and revoked_at is null`,
      [input.organizationId, email, identity.personId]
    );
    invitation = (await client.query(
      `insert into organization_invitations (organization_id,normalized_email,role,token_hash,invited_by_person_id,expires_at)
       values ($1,$2,$3,$4,$5,$6) returning id,role,expires_at,created_at`,
      [input.organizationId, email, role, tokenHash, identity.personId, invitationExpiresAt()]
    )).rows[0];
    await client.query(
      `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
       values ($1,$2,'organization_invitation.created','organization_invitation',$3,$4::jsonb)`,
      [input.organizationId, identity.personId, invitation.id, JSON.stringify({ role })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const org = (await db.query(`select coalesce(display_name,name) as name from organizations where id=$1`, [input.organizationId])).rows[0];
  const inviteUrl = `${appBaseUrl()}/invite/${token}`;
  let emailSent = false;
  try {
    const result = await sendEmailNotification({
      to: email,
      subject: `You are invited to help run ${org?.name || "a community"} on BandWagon`,
      body: [
        `${identity.displayName} invited you to be ${role === "admin" ? "an admin" : "a manager"} for ${org?.name || "their community"} on BandWagon.`,
        "",
        `Accept here: ${inviteUrl}`,
        "",
        `Sign in with this email address (${email}) to accept. The link works once and expires in 7 days.`,
        "If you were not expecting this, you can ignore it.",
      ].join("\n"),
      organizationId: input.organizationId,
      notificationType: "organization_invitation",
      urgency: "important",
      correlationId: `organization-invitation:${invitation.id}`,
    });
    emailSent = Boolean(result.ok);
  } catch {
    emailSent = false;
  }
  // When email is not configured the inviter can share the link directly. It
  // still only works for someone signed in with the invited email.
  return { invitation: { ...invitation, email, state: "active" }, emailSent, inviteUrl: emailSent ? null : inviteUrl };
}

export async function revokeInvitation(identity: SessionIdentity, input: { organizationId: string; invitationId: string }) {
  const access = await inviterAccess(identity, input.organizationId, true);
  const db = dbRequired();
  const current = await db.query(`select role from organization_invitations where id=$1 and organization_id=$2`, [input.invitationId, input.organizationId]);
  if (!current.rowCount) throw new Error("Invitation not found");
  if (!access.roles.includes(current.rows[0].role)) throw new Error("You cannot revoke this invitation");
  const updated = await db.query(
    `update organization_invitations set revoked_at=now(),revoked_by_person_id=$3
      where id=$1 and organization_id=$2 and accepted_at is null and revoked_at is null returning id`,
    [input.invitationId, input.organizationId, identity.personId]
  );
  if (!updated.rowCount) throw new Error("This invitation is no longer open");
  await db.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values ($1,$2,'organization_invitation.revoked','organization_invitation',$3,'{}'::jsonb)`,
    [input.organizationId, identity.personId, input.invitationId]
  );
}

export async function previewInvitation(token: string) {
  if (!looksLikeInvitationToken(token)) return null;
  const db = dbRequired();
  const result = await db.query(
    `select i.normalized_email,i.role,i.expires_at,i.accepted_at,i.revoked_at,coalesce(o.display_name,o.name) as organization_name
       from organization_invitations i join organizations o on o.id=i.organization_id and o.status='active'
      where i.token_hash=$1 limit 1`,
    [invitationTokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    organizationName: row.organization_name,
    role: row.role,
    emailHint: maskEmail(row.normalized_email),
    expiresAt: row.expires_at,
    state: invitationState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at }),
  };
}

export async function acceptInvitation(identity: SessionIdentity, token: string) {
  if (identity.supportMode) throw new Error("Support View cannot accept invitations");
  if (!looksLikeInvitationToken(token)) throw new Error("This invitation link is not valid");
  const db = dbRequired();
  const verifiedEmails = await verifiedEmailsForPerson(identity.personId);
  const client = await db.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      `select i.*,o.slug,o.tenant_hostname,coalesce(o.display_name,o.name) as organization_name
         from organization_invitations i join organizations o on o.id=i.organization_id and o.status='active'
        where i.token_hash=$1 for update of i`,
      [invitationTokenHash(token)]
    );
    const invite = found.rows[0];
    if (!invite) throw new Error("This invitation link is not valid");
    const state = invitationState({ expiresAt: invite.expires_at, acceptedAt: invite.accepted_at, revokedAt: invite.revoked_at });
    if (state === "accepted") throw new Error("This invitation was already used");
    if (state === "revoked") throw new Error("This invitation was canceled. Ask for a new one.");
    if (state === "expired") throw new Error("This invitation has expired. Ask for a new one.");
    if (!invitationEmailMatches(invite.normalized_email, verifiedEmails)) {
      throw new Error(`This invitation was sent to ${maskEmail(invite.normalized_email)}. Sign in with that email to accept it.`);
    }

    const membership = await client.query(
      `select id,role,status from memberships
        where organization_id=$1 and person_id=$2 and group_id is null
        order by (status='active') desc, created_at limit 1 for update`,
      [invite.organization_id, identity.personId]
    );
    const current = membership.rows[0];
    const previousRole = current && current.status === "active" ? current.role : null;
    const role = acceptedMembershipRole(previousRole, invite.role);
    let membershipId: string;
    if (current) {
      await client.query(`update memberships set role=$2,status='active' where id=$1`, [current.id, role]);
      membershipId = current.id;
    } else {
      membershipId = (await client.query(
        `insert into memberships (organization_id,group_id,person_id,role,status) values ($1,null,$2,$3,'active') returning id`,
        [invite.organization_id, identity.personId, role]
      )).rows[0].id;
    }
    await client.query(
      `update organization_invitations set accepted_at=now(),accepted_by_person_id=$2 where id=$1`,
      [invite.id, identity.personId]
    );
    await client.query(
      `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
       values ($1,$2,'organization_invitation.accepted','membership',$3,$4::jsonb)`,
      [invite.organization_id, identity.personId, membershipId, JSON.stringify({ invitationId: invite.id, invitedRole: invite.role, previousRole, role })]
    );
    await client.query("commit");
    return { organizationId: invite.organization_id, organizationName: invite.organization_name, role };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
