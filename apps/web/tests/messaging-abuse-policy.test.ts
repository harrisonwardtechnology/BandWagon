import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deliveredMobileChannel, enforceMobileMessageIntent, SMS_BRAND_PREFIX, withSmsBrandPrefix } from "../src/lib/messaging-policy.ts";
import { SMS_WELCOME_TEXT } from "../src/lib/sms-consent-policy.ts";

test("mobile messaging rejects unapproved or chat-like workflow types",()=>{
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"direct_message",body:"hello",personId:"person-1"}),/approved BandWagon transactional workflows/);
});

test("transactional messages require a bound BandWagon recipient",()=>{
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"ride_matched",body:"Ride confirmed"}),/bound to a BandWagon person/);
});

test("OTP and fixed platform tests may target pre-account test recipients",()=>{
  assert.equal(enforceMobileMessageIntent({notificationType:"otp",body:"Code 123456"}).body,"BandWagon: Code 123456");
  assert.equal(enforceMobileMessageIntent({notificationType:"platform_test",body:"Test"}).body,"BandWagon: Test");
});

test("mobile messaging strips control characters and enforces a short transactional bound",()=>{
  assert.equal(enforceMobileMessageIntent({notificationType:"safety_alert",body:"BandWagon\u0000 alert",personId:"person-1"}).body,"BandWagon alert");
  assert.throws(()=>enforceMobileMessageIntent({notificationType:"safety_alert",body:"x".repeat(601),personId:"person-1"}),/between 1 and 600/);
});


test("every text starts with the brand, using the same prefix as the welcome text",()=>{
  assert.equal(SMS_BRAND_PREFIX,"BandWagon: ");
  assert.ok(SMS_WELCOME_TEXT.startsWith(SMS_BRAND_PREFIX));
  // Bodies the router used to send as-is.
  for(const [notificationType,body] of [
    ["driver_arriving","Your driver is on the way."],
    ["waitlist_offer","A seat opened in a carpool you were waiting for. You have 30 minutes to accept it."],
    ["new_ride_available","A rider needs help getting to Friday Night Game. About +4 min."],
    ["last_minute_cancellation","The carpool you were waiting for was cancelled, so its waitlist has been cleared."],
    ["ride_matched","A ride for a child you help with is confirmed."],
  ] as const){
    const sent=enforceMobileMessageIntent({notificationType,body,personId:"person-1"}).body;
    assert.equal(sent,`BandWagon: ${body}`,notificationType);
  }
});

test("a body that already starts with the brand is never prefixed twice",()=>{
  for(const body of [
    "BandWagon verification code: 123456. Expires in 10 minutes.",
    "BandWagon platform test: Transactional messaging is working.",
    SMS_WELCOME_TEXT,
    "bandwagon: lower case still counts",
    "BandWagon: Your driver is on the way.",
  ]){
    assert.equal(withSmsBrandPrefix(body),body);
    assert.equal(withSmsBrandPrefix(withSmsBrandPrefix(body)),body);
  }
  assert.equal(withSmsBrandPrefix("Your driver has arrived."),"BandWagon: Your driver has arrived.");
  assert.equal(withSmsBrandPrefix(withSmsBrandPrefix("Your driver has arrived.")),"BandWagon: Your driver has arrived.");
  // A word that only begins with the same letters is not the brand.
  assert.equal(withSmsBrandPrefix("Bandwagons are fun"),"BandWagon: Bandwagons are fun");
  assert.equal(withSmsBrandPrefix("  "),"");
  // The 600 character limit is on the caller's text. The prefix is added on top.
  assert.equal(enforceMobileMessageIntent({notificationType:"safety_alert",body:"x".repeat(600),personId:"person-1"}).body.length,600+SMS_BRAND_PREFIX.length);
});

test("the brand prefix is for SMS/RCS only, not push or email",async()=>{
  const router=await readFile(new URL("../src/lib/notification-router.ts",import.meta.url),"utf8");
  assert.doesNotMatch(router,/withSmsBrandPrefix|SMS_BRAND_PREFIX/);
  assert.match(router,/pushPayload:PushPayload=\{title:request\.title,body:request\.body,/);
  assert.match(router,/sendEmailNotification\(\{to:context\.email,subject:request\.title,body:request\.body,/);
  const send=await readFile(new URL("../src/lib/twilio-send.ts",import.meta.url),"utf8");
  // The only path to Twilio takes its body from enforceMobileMessageIntent, which adds the prefix.
  assert.match(send,/const \{ body \} = enforceMobileMessageIntent\(input\);/);
  assert.match(send,/form\.set\("Body", body\);/);
  // Replies sent as TwiML from the inbound webhook carry the brand too.
  const inbound=await readFile(new URL("../src/app/api/webhooks/twilio/inbound/route.ts",import.meta.url),"utf8");
  const replies=inbound.match(/<Message>\$\{escapeXml\(([^`]*)\)\}<\/Message>/g)||[];
  assert.equal(replies.length,2);
  for(const reply of replies)assert.match(reply,/escapeXml\(withSmsBrandPrefix\(/);
});

test("the real channel is read from the Twilio status callback",()=>{
  assert.equal(deliveredMobileChannel({from:"rcs:bandwagon_51yrkdi9_agent"}),"rcs");
  assert.equal(deliveredMobileChannel({from:"+14695550100",channelPrefix:"rcs"}),"rcs");
  assert.equal(deliveredMobileChannel({from:"+14695550100"}),"sms");
  assert.equal(deliveredMobileChannel({from:"72345"}),"sms");
  assert.equal(deliveredMobileChannel({from:"BandWagon"}),"sms");
  assert.equal(deliveredMobileChannel({channelPrefix:"sms"}),"sms");
  // Unknown or missing: leave the log as it was.
  assert.equal(deliveredMobileChannel({}),null);
  assert.equal(deliveredMobileChannel({from:""}),null);
  assert.equal(deliveredMobileChannel({from:"whatsapp:+14695550100"}),null);
  assert.equal(deliveredMobileChannel({from:"+14695550100",channelPrefix:"whatsapp"}),null);
});

test("the status webhook records the delivered channel and keeps the requested one",async()=>{
  const route=await readFile(new URL("../src/app/api/webhooks/twilio/status/route.ts",import.meta.url),"utf8");
  assert.ok(route.indexOf("validateTwilioSignature(request, form)")<route.indexOf("recordDeliveredChannelFromStatus(form)"),"signature is checked first");
  assert.ok(route.indexOf("recordDeliveredChannelFromStatus(form)")<route.indexOf("markOnce("),"channel is recorded before the dedupe marker");
  const lib=await readFile(new URL("../src/lib/twilio-status.ts",import.meta.url),"utf8");
  assert.match(lib,/deliveredMobileChannel\(\{ from: form\.From, channelPrefix: form\.ChannelPrefix \}\)/);
  assert.match(lib,/update notification_deliveries/);
  assert.match(lib,/'requestedChannel',coalesce\(metadata->>'requestedChannel',channel\)/);
  assert.match(lib,/where provider_message_id=\$1 and channel in \('sms','rcs'\)/);
});
