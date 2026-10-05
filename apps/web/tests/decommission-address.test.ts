import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// The full flow (remove, clean up, reuse the address) was run against Postgres
// when this was written; these guards keep its shape from drifting.
const worker = fs.readFileSync("src/lib/organization-decommission-worker.ts", "utf8");

test("a removed community's address is released only after external cleanup succeeds", () => {
  const cleanBlock = worker.slice(worker.indexOf("if(allClean){"), worker.indexOf("results.push({id:row.id,status:allClean"));
  assert.match(cleanBlock, /releaseOrganizationAddress\(row\.organization_id,row\.id\)/);
});

test("release renames slug and hostnames to values that can never match a request", () => {
  assert.match(worker, /slug=slug\|\|'--'\|\|\$2,tenant_hostname=null/);
  assert.match(worker, /hostname=hostname\|\|'#'\|\|\$2/);
  assert.match(worker, /status='decommissioning'/);
  assert.match(worker, /address_released/);
});
