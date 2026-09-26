// Pure rules for organization admin invitations. No imports so node --test
// can load this file directly.

export const INVITATION_TTL_DAYS = 7;
export const INVITATION_ROLES = ["admin", "manager"] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

const ROLE_RANK: Record<string, number> = { member: 1, manager: 2, admin: 3, owner: 4 };

export function isInvitationRole(value: unknown): value is InvitationRole {
  return INVITATION_ROLES.includes(value as InvitationRole);
}

/** Roles the inviter may hand out. Owners invite admins and managers, admins invite managers, managers invite nobody. */
export function invitableRoles(inviterRole: string | null | undefined, options: { platformOwner?: boolean } = {}): InvitationRole[] {
  if (options.platformOwner || inviterRole === "owner") return ["admin", "manager"];
  if (inviterRole === "admin") return ["manager"];
  return [];
}

export function invitationRoleError(inviterRole: string | null | undefined, role: unknown, options: { platformOwner?: boolean } = {}) {
  if (!isInvitationRole(role)) return "Choose admin or manager";
  const allowed = invitableRoles(inviterRole, options);
  if (!allowed.length) return "Only owners and admins can invite people";
  if (!allowed.includes(role)) return "Only an owner can invite another admin";
  return null;
}

/** The membership role after accepting. Never lowers an existing role (an owner stays an owner). */
export function acceptedMembershipRole(currentRole: string | null | undefined, invitedRole: InvitationRole) {
  const current = currentRole && ROLE_RANK[currentRole] ? currentRole : null;
  if (current && ROLE_RANK[current] >= ROLE_RANK[invitedRole]) return current;
  return invitedRole;
}

export function invitationExpiresAt(now: Date = new Date()) {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type InvitationState = "active" | "accepted" | "revoked" | "expired";

export function invitationState(
  invitation: { expiresAt: Date | string; acceptedAt?: Date | string | null; revokedAt?: Date | string | null },
  now: Date = new Date()
): InvitationState {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function normalizeInviteEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidInviteEmail(value: unknown) {
  const email = normalizeInviteEmail(value);
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function invitationEmailMatches(invitedEmail: string, verifiedEmails: string[]) {
  const target = normalizeInviteEmail(invitedEmail);
  return Boolean(target) && verifiedEmails.some(email => normalizeInviteEmail(email) === target);
}

/** Tokens in links are 32 random bytes as base64url (43 characters). */
export function looksLikeInvitationToken(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
