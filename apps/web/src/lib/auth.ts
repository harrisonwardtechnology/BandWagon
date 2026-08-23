import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { sessionTokenHash } from "@/lib/auth-service";

export const SESSION_COOKIE = "bw_session";

export type SessionIdentity = {
  sessionId: string;
  userAccountId: string;
  personId: string;
  displayName: string;
  personType: "adult" | "minor";
  householdId: string | null;
  organizationIds: string[];
};

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  if (!db) return null;

  const result = await db.query(
    `select s.id as session_id,s.user_account_id,ua.person_id,p.display_name,p.person_type,p.household_id,
            coalesce(array_agg(distinct m.organization_id) filter (where m.status='active'),array[]::uuid[]) as organization_ids
     from auth_sessions s
     join user_accounts ua on ua.id=s.user_account_id and ua.status='active'
     join people p on p.id=ua.person_id and p.status='active'
     left join memberships m on m.person_id=p.id
     where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now()
     group by s.id,s.user_account_id,ua.person_id,p.display_name,p.person_type,p.household_id
     limit 1`,
    [sessionTokenHash(token)]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  await db.query(`update auth_sessions set last_seen_at=now() where id=$1`, [row.session_id]).catch(() => {});
  return {
    sessionId: row.session_id,
    userAccountId: row.user_account_id,
    personId: row.person_id,
    displayName: row.display_name,
    personType: row.person_type,
    householdId: row.household_id || null,
    organizationIds: row.organization_ids || [],
  };
}

export async function requireSessionIdentity() {
  const identity = await getSessionIdentity();
  if (!identity) throw new Error("Authentication required");
  return identity;
}

export async function requireOrganizationAccess(organizationId: string) {
  const identity = await requireSessionIdentity();
  if (!identity.organizationIds.includes(organizationId)) throw new Error("Organization access denied");
  return identity;
}
