import assert from "node:assert/strict";
import test from "node:test";
import { enforceMobileMessageIntent } from "../src/lib/messaging-policy.ts";

test("mobile messaging rejects unapproved or chat-like workflow types",()=>{
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"direct_message",body:"hello",personId:"person-1"}),/approved BandWagon transactional workflows/);
});

test("transactional messages require a bound BandWagon recipient",()=>{
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"ride_matched",body:"Ride confirmed"}),/bound to a BandWagon person/);
});

test("OTP and fixed platform tests may target pre-account test recipients",()=>{
  assert.equal(enforceMobileMessageIntent({notificationType:"otp",body:"Code 123456"}).body,"Code 123456");
  assert.equal(enforceMobileMessageIntent({notificationType:"platform_test",body:"Test"}).body,"Test");
});

test("mobile messaging strips control characters and enforces a short transactional bound",()=>{
  assert.equal(enforceMobileMessageIntent({notificationType:"safety_alert",body:"BandWagon\u0000 alert",personId:"person-1"}).body,"BandWagon alert");
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"safety_alert",body:"x".repeat(601),personId:"person-1"}),/between 1 and 600/);
});

