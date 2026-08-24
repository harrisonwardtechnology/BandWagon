import assert from "node:assert/strict";
import test from "node:test";
import { redactApplicationErrorText } from "../src/lib/error-monitoring-policy.ts";

test("application error envelopes redact common secrets and personal contacts",()=>{
  const value=redactApplicationErrorText("user@example.com +1 (469) 555-1212 code 123456 Bearer abc.def? token=x postgres://user:pass@db/prod?ssl=true");
  assert.equal(value.includes("user@example.com"),false);
  assert.equal(value.includes("555-1212"),false);
  assert.equal(value.includes("123456"),false);
  assert.equal(value.includes("abc.def"),false);
  assert.equal(value.includes("user:pass"),false);
});
