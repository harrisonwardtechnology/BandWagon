import assert from "node:assert/strict";
import test from "node:test";
import { auditEventsCsv, safeCsvCell } from "../src/lib/audit-export.ts";

test("audit CSV cells quote delimiters and block spreadsheet formulas",()=>{
  assert.equal(safeCsvCell('hello, "world"'),'"hello, ""world"""');
  assert.equal(safeCsvCell("=HYPERLINK(\"https://evil.example\")"),'"\'=HYPERLINK(""https://evil.example"")"');
  assert.equal(safeCsvCell("+1+1"),'"\'+1+1"');
});

test("audit CSV emits a stable header and JSON metadata",()=>{
  const csv=auditEventsCsv([{occurred_at:"2026-08-23T00:00:00Z",action:"test",outcome:"success",metadata:{safe:true}}]);
  assert.match(csv,/occurred_at/);assert.match(csv,/"test"/);assert.match(csv,/"\{""safe"":true\}"/);
});
