// Move every organization's default hostname from one tenant base domain to
// another, e.g. flomogo.harrisonward.org -> flomogo.bandwagon.club.
//
//   node scripts/move-tenant-domain.mjs --from harrisonward.org --to bandwagon.club          (dry run)
//   node scripts/move-tenant-domain.mjs --from harrisonward.org --to bandwagon.club --apply
//
// For each organization it:
//   - adds <slug>.<to> as an active platform domain and makes it primary if the
//     old one was primary,
//   - keeps <slug>.<from> active (non-primary) so old links and customer CNAMEs
//     keep resolving; the app redirects page visits to the new host,
//   - points organizations.tenant_hostname at the new host,
//   - re-targets custom domains that are NOT yet active to the new host. Active
//     custom domains keep their current CNAME target so nothing breaks; move
//     those with the customer later.
// Safe to run more than once.
import pg from "pg";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const clean = (v) => String(v || "").trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
const from = clean(arg("from"));
const to = clean(arg("to"));
const apply = process.argv.includes("--apply");
const hostRe = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
if (!hostRe.test(from) || !hostRe.test(to) || from === to) {
  console.error("Usage: node scripts/move-tenant-domain.mjs --from old.example --to new.example [--apply]");
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
const LOCK = 7_220_451_032;
const summary = { organizations: 0, moved: 0, alreadyMoved: 0, conflicts: 0, customRetargeted: 0, customLeftActive: 0 };

try {
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  const rows = (await client.query(
    `select o.id, o.slug, o.tenant_hostname, d.id as domain_id, d.hostname, d.is_primary
       from organizations o
       join organization_domains d on d.organization_id=o.id and d.domain_type='platform'
      where d.hostname like $1
      order by o.slug`,
    [`%.${from}`]
  )).rows;

  for (const row of rows) {
    const label = row.hostname.slice(0, -(from.length + 1));
    if (!label || label.includes(".")) continue;
    summary.organizations++;
    const newHost = `${label}.${to}`;
    const taken = (await client.query(`select organization_id from organization_domains where hostname=$1`, [newHost])).rows[0];
    if (taken && taken.organization_id !== row.id) {
      summary.conflicts++;
      console.warn(`CONFLICT ${row.slug}: ${newHost} already belongs to another organization; skipped`);
      continue;
    }
    const pendingCustom = (await client.query(
      `select id,hostname,status from organization_domains where organization_id=$1 and domain_type='custom' and target_hostname=$2`,
      [row.id, row.hostname]
    )).rows;
    const retarget = pendingCustom.filter((d) => d.status !== "active");
    summary.customRetargeted += retarget.length;
    summary.customLeftActive += pendingCustom.length - retarget.length;

    if (taken && row.tenant_hostname === newHost) {
      summary.alreadyMoved++;
      console.log(`ok       ${row.slug}: already on ${newHost}`);
      continue;
    }
    console.log(`${apply ? "move    " : "would   "} ${row.slug}: ${row.hostname} -> ${newHost}${retarget.length ? ` (+${retarget.length} pending custom domain target)` : ""}`);
    if (!apply) continue;

    await client.query("begin");
    try {
      await client.query(
        `insert into organization_domains
           (organization_id,hostname,status,is_primary,verified_at,activated_at,domain_type,target_hostname,dns_status,ssl_status,verification_method)
         values ($1,$2,'active',false,now(),now(),'platform',$2,'active','active','platform_wildcard')
         on conflict (hostname) do nothing`,
        [row.id, newHost]
      );
      if (row.is_primary) {
        await client.query(`update organization_domains set is_primary=false,updated_at=now() where organization_id=$1`, [row.id]);
        await client.query(`update organization_domains set is_primary=true,updated_at=now() where hostname=$1`, [newHost]);
      }
      await client.query(`update organizations set tenant_hostname=$2,updated_at=now() where id=$1`, [row.id, newHost]);
      for (const d of retarget) {
        await client.query(`update organization_domains set target_hostname=$2,updated_at=now() where id=$1`, [d.id, newHost]);
      }
      await client.query(
        `insert into audit_events (organization_id,action,target_type,target_id,metadata)
         values ($1::uuid,'organization.tenant_domain_moved','organization',$1::text,$2::jsonb)`,
        [row.id, JSON.stringify({ from: row.hostname, to: newHost, customRetargeted: retarget.map((d) => d.hostname) })]
      );
      await client.query("commit");
      summary.moved++;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => {});
  await client.end();
}

console.log(`\n${apply ? "Applied" : "Dry run"}: ${JSON.stringify(summary)}`);
if (!apply) console.log("Nothing was changed. Re-run with --apply to make these changes.");
