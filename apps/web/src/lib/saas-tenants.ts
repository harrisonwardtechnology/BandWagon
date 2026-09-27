import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getDb } from "@/lib/db";
import { tenantBaseDomain } from "@/lib/platform-hosts";
import { isReservedTenantSlug, normalizeSlug, TENANT_SLUG_MAX, TENANT_SLUG_MIN } from "@/lib/organization-onboarding-policy";

export { isReservedTenantSlug, normalizeSlug } from "@/lib/organization-onboarding-policy";


export function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").split(":")[0];
}

export function tenantHostnameForSlug(slug: string) {
  return `${normalizeSlug(slug)}.${tenantBaseDomain()}`;
}

export { tenantBaseDomain };

/** True when no organization already uses the slug or its platform hostname. */
export async function isTenantSlugAvailable(slugValue: string, client?: Pick<PoolClient, "query">) {
  const db = client || getDb();
  if (!db) throw new Error("Database is not configured");
  const slug = normalizeSlug(slugValue);
  const existing = await db.query(`select 1 from organizations where slug=$1 or tenant_hostname=$2 limit 1`, [slug, tenantHostnameForSlug(slug)]);
  return !existing.rowCount;
}

export async function listOrganizations() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select o.id,o.name,o.display_name,o.slug,o.status,o.discoverability,o.tenant_hostname,o.created_at,o.updated_at,
            coalesce(json_agg(json_build_object(
              'id',d.id,'hostname',d.hostname,'status',d.status,'isPrimary',d.is_primary,
              'domainType',d.domain_type,'dnsStatus',d.dns_status,'sslStatus',d.ssl_status,
              'targetHostname',d.target_hostname,'lastCheckedAt',d.last_checked_at
            ) order by d.is_primary desc,d.created_at) filter (where d.id is not null),'[]'::json) as domains
     from organizations o
     left join organization_domains d on d.organization_id=o.id
     group by o.id
     order by o.created_at asc`
  );
  return result.rows;
}

export async function getOrganizationById(id: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(`select * from organizations where id=$1 limit 1`, [id]);
  return result.rows[0] || null;
}

export async function resolveOrganizationByHostname(hostnameValue: string) {
  const db = getDb();
  if (!db) return null;
  const hostname = normalizeHostname(hostnameValue);
  const result = await db.query(
    `select o.id,o.name,o.display_name,o.slug,o.status,o.discoverability,o.tenant_hostname,o.branding,o.settings,
            d.hostname,d.is_primary,d.domain_type
     from organization_domains d
     join organizations o on o.id=d.organization_id
     where d.hostname=$1 and d.status='active' and o.status='active'
     limit 1`,
    [hostname]
  );
  return result.rows[0] || null;
}

export type CreateOrganizationInput = { name: string; slug: string; discoverability?: string; actorPersonId?: string | null; metadata?: Record<string, unknown> };

/**
 * Creates an organization using a caller-owned client. The caller controls the
 * transaction, so onboarding approval can add memberships and settings atomically.
 */
export async function createOrganizationWithClient(client: Pick<PoolClient, "query">, input: CreateOrganizationInput) {
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  if (!name) throw new Error("Organization name is required");
  if (!slug || slug.length < TENANT_SLUG_MIN || slug.length > TENANT_SLUG_MAX) throw new Error("Tenant slug must be 2-50 characters");
  if (isReservedTenantSlug(slug)) throw new Error("That tenant slug is reserved");
  const hostname = tenantHostnameForSlug(slug);

  const existing = await client.query(`select id from organizations where slug=$1 or tenant_hostname=$2 limit 1`, [slug, hostname]);
  if (existing.rowCount) throw new Error("That tenant slug is already in use");

  const org = await client.query(
    `insert into organizations (name,display_name,slug,status,discoverability,tenant_hostname)
     values ($1,$1,$2,'active',$3,$4)
     returning *`,
    [name, slug, input.discoverability || "unlisted", hostname]
  );

  await client.query(
    `insert into organization_domains
      (organization_id,hostname,status,is_primary,verified_at,activated_at,domain_type,target_hostname,dns_status,ssl_status,verification_method)
     values ($1,$2,'active',true,now(),now(),'platform',$2,'active','active','platform_wildcard')`,
    [org.rows[0].id, hostname]
  );

  await seedOrganizationDefaults(client, org.rows[0].id);

  await client.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values ($1,$2,'organization.created','organization',$3,$4::jsonb)`,
    [org.rows[0].id, input.actorPersonId || null, String(org.rows[0].id), JSON.stringify({ slug, tenantHostname: hostname, ...(input.metadata || {}) })]
  );

  return org.rows[0];
}

/**
 * Default per-organization settings rows. Conservative: optional modules such as
 * AI stay off, driver rules use the platform defaults, calendar sync is allowed.
 */
export async function seedOrganizationDefaults(client: Pick<PoolClient, "query">, organizationId: string) {
  await client.query(`insert into organization_driver_requirements (organization_id) values ($1) on conflict (organization_id) do nothing`, [organizationId]);
  await client.query(`insert into organization_calendar_settings (organization_id) values ($1) on conflict (organization_id) do nothing`, [organizationId]);
  await client.query(`insert into organization_ai_settings (organization_id) values ($1) on conflict (organization_id) do nothing`, [organizationId]);
}

export async function createOrganization(input: CreateOrganizationInput) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const client = await db.connect();
  try {
    await client.query("begin");
    const organization = await createOrganizationWithClient(client, input);
    await client.query("commit");
    return organization;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_SAAS_ZONE_ID);
}

async function cloudflareRequest(path: string, init: RequestInit = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not configured");
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body?.errors?.[0]?.message || "Cloudflare API request failed");
  }
  return body.result;
}

export async function requestCustomDomain(input: { organizationId: string; hostname: string }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const hostname = normalizeHostname(input.hostname);
  if (!hostname.includes(".")) throw new Error("Enter a fully qualified hostname");
  const baseDomain = tenantBaseDomain();
  if (hostname.endsWith(`.${baseDomain}`) || hostname === baseDomain) {
    throw new Error(`Use the tenant hostname for ${baseDomain} addresses; custom domains must be external`);
  }

  const org = await getOrganizationById(input.organizationId);
  if (!org) throw new Error("Organization not found");
  const targetHostname = org.tenant_hostname || tenantHostnameForSlug(org.slug);
  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  let cloudflareId: string | null = null;
  let sslStatus = "pending";
  let status = "requested";

  if (cloudflareConfigured()) {
    const zoneId = process.env.CLOUDFLARE_SAAS_ZONE_ID!;
    const result = await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames`, {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: { method: "http", type: "dv" },
        custom_metadata: { organization_id: input.organizationId, bandwagon_target: targetHostname },
      }),
    });
    cloudflareId = result.id || null;
    sslStatus = result.ssl?.status || "pending";
    status = result.status === "active" ? "active" : "requested";
  }

  const result = await db.query(
    `insert into organization_domains
      (organization_id,hostname,verification_token_hash,status,is_primary,domain_type,target_hostname,
       cloudflare_custom_hostname_id,ssl_status,dns_status,verification_method,last_checked_at)
     values ($1,$2,$3,$4,false,'custom',$5,$6,$7,'pending','cname',now())
     on conflict (hostname) do update set
       organization_id=excluded.organization_id,
       verification_token_hash=excluded.verification_token_hash,
       target_hostname=excluded.target_hostname,
       cloudflare_custom_hostname_id=coalesce(excluded.cloudflare_custom_hostname_id,organization_domains.cloudflare_custom_hostname_id),
       ssl_status=excluded.ssl_status,
       updated_at=now()
     returning *`,
    [input.organizationId, hostname, tokenHash, status, targetHostname, cloudflareId, sslStatus]
  );

  return {
    domain: result.rows[0],
    cname: { name: hostname, target: targetHostname },
    cloudflareProvisioned: Boolean(cloudflareId),
  };
}

async function resolveCname(hostname: string) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", "CNAME");
  const response = await fetch(url, { headers: { accept: "application/dns-json" }, cache: "no-store" });
  if (!response.ok) return [] as string[];
  const body = await response.json();
  return (body.Answer || []).filter((a: any) => a.type === 5).map((a: any) => String(a.data || "").replace(/\.$/, "").toLowerCase());
}

export async function verifyCustomDomain(domainId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(`select * from organization_domains where id=$1 and domain_type='custom' limit 1`, [domainId]);
  const domain = result.rows[0];
  if (!domain) throw new Error("Custom domain not found");

  const cnameAnswers = await resolveCname(domain.hostname);
  const cnameOk = cnameAnswers.includes(normalizeHostname(domain.target_hostname));
  let sslStatus = domain.ssl_status || "pending";
  let cfStatus = domain.status;

  if (domain.cloudflare_custom_hostname_id && cloudflareConfigured()) {
    const zoneId = process.env.CLOUDFLARE_SAAS_ZONE_ID!;
    const cf = await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(domain.cloudflare_custom_hostname_id)}`);
    sslStatus = cf.ssl?.status || sslStatus;
    cfStatus = cf.status === "active" ? "active" : cfStatus;
  }

  const active = cnameOk && (sslStatus === "active" || !cloudflareConfigured());
  const updated = await db.query(
    `update organization_domains
     set dns_status=$1, ssl_status=$2, status=$3,
         verified_at=case when $4 then coalesce(verified_at,now()) else verified_at end,
         activated_at=case when $4 then coalesce(activated_at,now()) else activated_at end,
         last_checked_at=now(), updated_at=now()
     where id=$5 returning *`,
    [cnameOk ? "active" : "pending", sslStatus, active ? "active" : cfStatus, active, domainId]
  );

  return { domain: updated.rows[0], cnameAnswers, cnameOk, active };
}

export async function setPrimaryDomain(organizationId: string, domainId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const tx=await db.connect();await tx.query("begin");
  try {
    const selected = await tx.query(
      `select id from organization_domains where id=$1 and organization_id=$2 and status='active' limit 1`,
      [domainId, organizationId]
    );
    if (!selected.rowCount) throw new Error("Domain must be active before it can be primary");
    await tx.query(`update organization_domains set is_primary=false,updated_at=now() where organization_id=$1`, [organizationId]);
    await tx.query(`update organization_domains set is_primary=true,updated_at=now() where id=$1`, [domainId]);
    await tx.query("commit");
  } catch (error) {
    await tx.query("rollback").catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}
