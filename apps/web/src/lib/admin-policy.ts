export const PLATFORM_ROLES = ["owner", "support", "finance", "readonly"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ORGANIZATION_ADMIN_ROLES = ["owner", "admin", "manager"] as const;
export type OrganizationAdminRole = (typeof ORGANIZATION_ADMIN_ROLES)[number];

export function isOrganizationAdminRole(value: unknown): value is OrganizationAdminRole {
  return ORGANIZATION_ADMIN_ROLES.includes(value as OrganizationAdminRole);
}

export function parsePlatformRole(value: unknown): PlatformRole | null {
  if (value == null || value === "" || value === "none") return null;
  if (typeof value === "string" && PLATFORM_ROLES.includes(value as PlatformRole)) {
    return value as PlatformRole;
  }
  throw new Error("Invalid platform role");
}

export function platformRoleChangeError(input: {
  operatorUserAccountId: string;
  targetUserAccountId: string;
  currentRole: PlatformRole | null;
  requestedRole: PlatformRole | null;
  otherActiveOwnerCount: number;
}) {
  if (
    input.operatorUserAccountId === input.targetUserAccountId &&
    input.currentRole !== input.requestedRole
  ) {
    return "Another platform owner must change your own role";
  }
  if (
    input.currentRole === "owner" &&
    input.requestedRole !== "owner" &&
    input.otherActiveOwnerCount < 1
  ) {
    return "BandWagon must retain at least one active platform owner";
  }
  return null;
}
