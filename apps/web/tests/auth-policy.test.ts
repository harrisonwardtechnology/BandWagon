import assert from "node:assert/strict";
import test from "node:test";
import { boundedInteger, sessionIdleDays, sessionLifetimeDays } from "../src/lib/auth-policy.ts";

test("bounded integer settings reject non-finite and out-of-range values", () => {
  assert.equal(boundedInteger("12",7,1,30),12);
  assert.equal(boundedInteger("12.9",7,1,30),12);
  assert.equal(boundedInteger("invalid",7,1,30),7);
  assert.equal(boundedInteger(0,7,1,30),1);
  assert.equal(boundedInteger(100,7,1,30),30);
});

test("session lifetime and idle defaults stay within policy", () => {
  assert.equal(sessionLifetimeDays(undefined),30);
  assert.equal(sessionLifetimeDays(180),90);
  assert.equal(sessionIdleDays(undefined),14);
  assert.equal(sessionIdleDays(45),30);
});
