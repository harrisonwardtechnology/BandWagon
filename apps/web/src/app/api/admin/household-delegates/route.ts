import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, private" };

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function settings(organizationId: string) {
  const row = (await dbRequired().query(
    `select id,coalesce(display_name,name) as name,household_delegates_enabled from organizations where id=$1`,
    [organizationId]
  )).rows[0];
  if (!row) throw new Error("Organization not found");
  return { organizationId: row.id, name: row.name, householdDelegatesEnabled: row.household_delegates_enabled !== false };
}

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ ok: true, organizations: await listAdminOrganizations(identity) }, { headers });
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: false, allowPlatformRoles: ["owner", "support", "readonly"] });
    return NextResponse.json({ ok: true, settings: await settings(organizationId) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Administrator access required" }, { status: 403, headers });
  }
}

export async function POST(request: Request) {
  let identity;
  let organizationId = "";
  let body: Record<string, unknown> = {};
  try {
    identity = await requireSessionIdentity();
    body = await request.json().catch(() => ({}));
    organizationId = String(body.organizationId || "");
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization administrator access is required" }, { status: 403, headers });
  }
  try {
    if (body.action !== "update-settings") return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
    const enabled = body.householdDelegatesEnabled === true;
    const db = dbRequired();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`update organizations set household_delegates_enabled=$2 where id=$1`, [organizationId, enabled]);
      await client.query(
        `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
         values ($1::uuid,$2::uuid,'organization.household_delegates_updated','organization',$1::text,$3::jsonb)`,
        [organizationId, identity.personId, JSON.stringify({ householdDelegatesEnabled: enabled })]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true, settings: await settings(organizationId) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save" }, { status: 400, headers });
  }
}
