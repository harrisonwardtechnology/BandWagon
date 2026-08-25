import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseTwilioForm } from "../src/lib/twilio-form.ts";

test("Twilio form parsing preserves legitimate signed-form fields", async () => {
  const request = new Request("https://bandwagon.example/api/webhooks/twilio/inbound", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "MessageSid=SM123&From=%2B14695550123&Body=START",
  });
  assert.deepEqual(await parseTwilioForm(request), {
    MessageSid: "SM123",
    From: "+14695550123",
    Body: "START",
  });
});

test("Twilio form parsing rejects a declared oversized body", async () => {
  const request = new Request("https://bandwagon.example/api/webhooks/twilio/inbound", {
    method: "POST",
    headers: { "content-length": "65537" },
    body: "x",
  });
  await assert.rejects(() => parseTwilioForm(request), /payload is too large/);
});

test("Twilio form parsing accepts a valid body at the exact byte limit", async () => {
  const value = "a".repeat(65_534);
  const request = new Request("https://bandwagon.example/api/webhooks/twilio/inbound", {
    method: "POST",
    body: `x=${value}`,
  });
  assert.equal((await parseTwilioForm(request)).x, value);
});

test("Twilio form parsing cancels an oversized chunked body while streaming", async () => {
  let cancelled = false;
  let emitted = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      emitted++;
      controller.enqueue(new Uint8Array(40_000));
      if (emitted === 3) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://bandwagon.example/api/webhooks/twilio/inbound", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(() => parseTwilioForm(request), /payload is too large/);
  assert.equal(cancelled, true);
  assert.ok(emitted <= 2);
});

test("outbound mobile quota is reserved under a database lock before the carrier call", async () => {
  const source = await readFile(new URL("../src/lib/twilio-send.ts", import.meta.url), "utf8");
  const begin = source.indexOf('await client.query("BEGIN")');
  const lock = source.indexOf("pg_advisory_xact_lock", begin);
  const reservation = source.indexOf("values ($1,$2,$3,$4,$5,'reserved'", lock);
  const commit = source.indexOf('await client.query("COMMIT")', reservation);
  const carrier = source.indexOf("response = await fetch(endpoint", commit);
  assert.ok(begin >= 0 && begin < lock);
  assert.ok(lock < reservation);
  assert.ok(reservation < commit);
  assert.ok(commit < carrier);
  assert.match(source, /Database is required to enforce production mobile messaging controls/);
});

test("public OTP quota checks and challenge reservation share ordered database locks", async () => {
  const source = await readFile(new URL("../src/lib/auth-service.ts", import.meta.url), "utf8");
  const begin = source.indexOf('await client.query("BEGIN")', source.indexOf("export async function requestOtp"));
  const sortedLocks = source.indexOf("].sort()", begin);
  const lock = source.indexOf("pg_advisory_xact_lock", sortedLocks);
  const identifierCount = source.indexOf("where identifier_lookup=$1", lock);
  const ipCount = source.indexOf("where request_ip_hash=$1", identifierCount);
  const reservation = source.indexOf("insert into auth_otp_challenges", ipCount);
  const commit = source.indexOf('await client.query("COMMIT")', reservation);
  const delivery = source.indexOf("await sendTwilioNotification", commit);
  assert.ok(begin >= 0 && begin < sortedLocks);
  assert.ok(sortedLocks < lock);
  assert.ok(lock < identifierCount);
  assert.ok(identifierCount < ipCount);
  assert.ok(ipCount < reservation);
  assert.ok(reservation < commit);
  assert.ok(commit < delivery);
});
