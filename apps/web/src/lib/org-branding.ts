import { requireOrganizationAdmin } from "@/lib/admin-access";
import { getDb } from "@/lib/db";
import { resolveBranding, validateBranding } from "@/lib/branding-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function getOrganizationBranding(organizationId: string) {
  await requireOrganizationAdmin(organizationId, { write: false });
  const row = (
    await dbRequired().query(`select id,name,display_name,slug,tenant_hostname,branding from organizations where id=$1`, [organizationId])
  ).rows[0];
  if (!row) throw new Error("Organization not found");
  return {
    organizationId: row.id,
    slug: row.slug,
    tenantHostname: row.tenant_hostname,
    saved: { displayName: row.display_name || row.name, ...(row.branding || {}) },
    resolved: resolveBranding({ displayName: row.display_name, name: row.name, branding: row.branding }),
  };
}

/** Owners and admins can change branding; managers can view it. */
export async function updateOrganizationBranding(organizationId: string, input: Record<string, unknown>) {
  const access = await requireOrganizationAdmin(organizationId, { write: true });
  if (!access.platformAccess && access.organizationRole === "manager") {
    throw new Error("Only owners and admins can change branding");
  }
  const checked = validateBranding(input);
  if (!checked.ok) return { ok: false as const, errors: checked.errors };
  const { displayName, ...branding } = checked.value;
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("begin");
    const before = (await client.query(`select display_name,branding from organizations where id=$1 for update`, [organizationId])).rows[0];
    if (!before) throw new Error("Organization not found");
    // Replace the editable keys and keep any keys this editor does not manage.
    const merged = { ...(before.branding || {}) };
    for (const key of ["communityName", "tagline", "welcomeText", "logoUrl", "accentColor"]) delete merged[key];
    Object.assign(merged, branding);
    await client.query(`update organizations set display_name=$2,branding=$3::jsonb,updated_at=now() where id=$1`, [organizationId, displayName, JSON.stringify(merged)]);
    await client.query(
      `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata)
       values($1::uuid,$2,'organization.branding_updated','organization',$1::text,$3::jsonb)`,
      [organizationId, access.identity.personId, JSON.stringify({ changed: Object.keys({ displayName, ...branding }) })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { ok: true as const, ...(await getOrganizationBranding(organizationId)) };
}
