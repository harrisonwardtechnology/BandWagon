import crypto from "node:crypto";
import { getDb } from "@/lib/db";

const TENANT_BASE_DOMAIN = (process.env.TENANT_BASE_DOMAIN || "harrisonward.org").toLowerCase();

export function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").split(":")[0];
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function tenantHostnameForSlug(slug: string) {
  return `${normalizeSlug(slug)}.${TENANT_BASE_DOMAIN}`;
}

export function isReservedTenantSlug(slug: string) {
  return new Set(["www", "admin", "api", "app", "support", "status", "mail", "smtp", "mta-sts", "autodiscover", "calendar", "help", "docs"]).has(normalizeSlug(slug));
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

export async function createOrganization(input: { name: string; slug: string; discoverability?: string }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  if (!name) throw new Error("Organization name is required");
  if (!slug || slug.length < 2 || slug.length > 50) throw new Error("Tenant slug must be 2-50 characters");
  if (isReservedTenantSlug(slug)) throw new Error("That tenant slug is reserved");
  const hostname = tenantHostnameForSlug(slug);

  await db.query("begin");
  try {
    const existing = await db.query(`select id from organizations where slug=$1 or tenant_hostname=$2 limit 1`, [slug, hostname]);
    if (existing.rowCount) throw new Error("That tenant slug is already in use");

    const org = await db.query(
      `insert into organizations (name,display_name,slug,status,discoverability,tenant_hostname)
       values ($1,$1,$2,'active',$3,$4)
       returning *`,
      [name, slug, input.discoverability || "unlisted", hostname]
    );

    await db.query(
      `insert into organization_domains
        (organization_id,hostname,status,is_primary,verified_at,activated_at,domain_type,target_hostname,dns_status,ssl_status,verification_method)
       values ($1,$2,'active',true,now(),now(),'platform',$2,'active','active','platform_wildcard')`,
      [org.rows[0].id, hostname]
    );

    await db.query(
      `insert into audit_events (organization_id,action,target_type,target_id,metadata)
       values ($1,'organization.created','organization',$1,$2::jsonb)`,
      [org.rows[0].id, JSON.stringify({ slug, tenantHostname: hostname })]
    );

    await db.query("commit");
    return org.rows[0];
  } catch (error) {
    await db.query("rollback");
    throw error;
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
  if (hostname.endsWith(`.${TENANT_BASE_DOMAIN}`) || hostname === TENANT_BASE_DOMAIN) {
    throw new Error("Use the tenant hostname for HarrisonWard.org addresses; custom domains must be external");
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
  await db.query("begin");
  try {
    const selected = await db.query(
      `select id from organization_domains where id=$1 and organization_id=$2 and status='active' limit 1`,
      [domainId, organizationId]
    );
    if (!selected.rowCount) throw new Error("Domain must be active before it can be primary");
    await db.query(`update organization_domains set is_primary=false,updated_at=now() where organization_id=$1`, [organizationId]);
    await db.query(`update organization_domains set is_primary=true,updated_at=now() where id=$1`, [domainId]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
