import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const packagePath = "public/documents/BandWagon_Organization_Proposal_and_Review_Package.docx";
const publicUrl = "/documents/BandWagon_Organization_Proposal_and_Review_Package.docx";

test("organization proposal is published and linked from public review surfaces", () => {
  const help = fs.readFileSync("src/app/help/page.tsx", "utf8");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.equal(fs.existsSync(packagePath), true);
  assert.ok(fs.statSync(packagePath).size > 1_000_000);
  assert.match(help, /proposal material - not an approval or launch authorization/i);
  assert.match(help, /Which ThirdParty services can receive data/);
  assert.ok(help.includes(publicUrl));
  assert.ok(layout.includes(publicUrl));
  assert.ok(home.includes(publicUrl));
});
