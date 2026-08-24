import { requirePlatformRole } from "@/lib/auth";
import {
  parsePlatformRole,
  platformRoleChangeError,
  type PlatformRole,
} from "@/lib/admin-policy";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function GET(request: Request) {
  try {
    const identity = await requirePlatformRole(["owner"]);
    const search = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (search && search.length < 2) {
      return Response.json({ error: "Search must contain at least 2 characters" }, { status: 400 });
    }

    const params: string[] = [];
    let searchClause = "ua.platform_role is not null";
    if (search) {
      params.push(`%${search}%`);
      searchClause += ` or p.display_name ilike $1 or coalesce(e.normalized_email,'') ilike $1`;
    }

    const accounts = await dbRequired().query(
      `select ua.id as user_account_id,ua.platform_role,ua.status,ua.created_at,
              ua.last_login_at,p.id as person_id,p.display_name,p.person_type,
              e.normalized_email as email,
              (select count(*)::int from memberships m
                where m.person_id=p.id and m.status='active' and m.group_id is null) as organization_count
         from user_accounts ua
         join people p on p.id=ua.person_id and p.status='active'
         left join lateral (
           select normalized_email from emails
            where person_id=p.id
            order by verified_at desc nulls last,created_at desc
            limit 1
         ) e on true
        where ua.status='active' and (${searchClause})
        order by (ua.platform_role is null),p.display_name
        limit 100`,
      params
    );

    return Response.json({
      ok: true,
      operatorUserAccountId: identity.userAccountId,
      accounts: accounts.rows,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Platform owner access is required" },
      { status: 403 }
    );
  }
}

export async function POST(request: Request) {
  let identity;
  try {
    identity = await requirePlatformRole(["owner"]);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Platform owner access is required" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const targetUserAccountId = String(body.targetUserAccountId || "").trim();
  let requestedRole: PlatformRole | null;
  try {
    requestedRole = parsePlatformRole(body.platformRole);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid platform role" },
      { status: 400 }
    );
  }
  if (!targetUserAccountId) {
    return Response.json({ error: "targetUserAccountId is required" }, { status: 400 });
  }

  const client = await dbRequired().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('bandwagon:platform-role-management'))");
    const target = await client.query(
      `select ua.id,ua.platform_role,ua.person_id,p.display_name
         from user_accounts ua
         join people p on p.id=ua.person_id
        where ua.id=$1 and ua.status='active' and p.status='active'
        for update of ua`,
      [targetUserAccountId]
    );
    if (!target.rowCount) throw new Error("Active target account was not found");
    const row = target.rows[0];
    const currentRole = row.platform_role || null;

    const owners = currentRole === "owner" && requestedRole !== "owner"
      ? await client.query(
          `select count(*)::int as count from user_accounts
            where platform_role='owner' and status='active' and id<>$1`,
          [targetUserAccountId]
        )
      : { rows: [{ count: 1 }] };
    const policyError = platformRoleChangeError({
      operatorUserAccountId: identity.userAccountId,
      targetUserAccountId,
      currentRole,
      requestedRole,
      otherActiveOwnerCount: Number(owners.rows[0]?.count || 0),
    });
    if (policyError) throw new Error(policyError);

    await client.query(
      `update user_accounts set platform_role=$1,updated_at=now() where id=$2`,
      [requestedRole, targetUserAccountId]
    );
    await client.query(
      `insert into audit_events
         (organization_id,actor_person_id,action,target_type,target_id,metadata)
       values(null,$1,'platform_role_changed','user_account',$2,$3::jsonb)`,
      [
        identity.personId,
        targetUserAccountId,
        JSON.stringify({
          targetPersonId: row.person_id,
          targetDisplayName: row.display_name,
          previousRole: currentRole,
          platformRole: requestedRole,
        }),
      ]
    );
    await client.query("commit");
    return Response.json({ ok: true, platformRole: requestedRole });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to change platform role" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
