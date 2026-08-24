import {
  getBaseSessionIdentity,
  getSessionIdentity,
  type SessionIdentity,
} from "@/lib/auth";
import {
  isOrganizationAdminRole,
  type OrganizationAdminRole,
} from "@/lib/admin-policy";
import { getDb } from "@/lib/db";

export type { OrganizationAdminRole } from "@/lib/admin-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function requireOrganizationAdmin(
  organizationId: string,
  options: {
    write?: boolean;
    allowPlatformRoles?: Array<NonNullable<SessionIdentity["platformRole"]>>;
  } = {}
) {
  if (!organizationId) throw new Error("organizationId is required");
  const write = options.write !== false;
  const identity = await getSessionIdentity();
  if (!identity) throw new Error("Authentication required");

  return assertIdentityOrganizationAdmin(identity, organizationId, options);
}

export async function assertIdentityOrganizationAdmin(
  identity: SessionIdentity,
  organizationId: string,
  options: {
    write?: boolean;
    allowPlatformRoles?: Array<NonNullable<SessionIdentity["platformRole"]>>;
  } = {}
) {
  if (!organizationId) throw new Error("organizationId is required");
  const write = options.write !== false;

  if (identity.supportMode) {
    if (write && identity.supportMode.mode !== "assist") {
      throw new Error("Support View is read-only");
    }
  } else {
    const allowedPlatformRoles = options.allowPlatformRoles || ["owner"];
    if (
      identity.platformRole &&
      allowedPlatformRoles.includes(identity.platformRole)
    ) {
      return { identity, organizationRole: null, platformAccess: true };
    }
  }

  const db = dbRequired();
  const membership = await db.query(
    `select role
       from memberships
      where organization_id=$1
        and person_id=$2
        and group_id is null
        and status='active'
      limit 1`,
    [organizationId, identity.personId]
  );
  const role = membership.rows[0]?.role as OrganizationAdminRole | undefined;
  if (!isOrganizationAdminRole(role)) {
    throw new Error("Organization administrator access is required");
  }
  return { identity, organizationRole: role, platformAccess: false };
}

export async function listOrganizationsForAdministrator() {
  const identity = await getSessionIdentity();
  if (!identity) throw new Error("Authentication required");
  const db = dbRequired();

  if (!identity.supportMode) {
    const base = await getBaseSessionIdentity();
    if (base?.platformRole === "owner") {
      return (
        await db.query(
          `select id,coalesce(display_name,name) as name,slug,'platform_owner'::text as role
             from organizations
            where status='active'
            order by name`
        )
      ).rows;
    }
  }

  return (
    await db.query(
      `select o.id,coalesce(o.display_name,o.name) as name,o.slug,m.role
         from memberships m
         join organizations o on o.id=m.organization_id
        where m.person_id=$1
          and m.group_id is null
          and m.status='active'
          and m.role in ('owner','admin','manager')
          and o.status='active'
        order by name`,
      [identity.personId]
    )
  ).rows;
}
