import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMicrosoftGraphNextLink, microsoftDateTime } from "../src/lib/microsoft-calendar-policy.ts";
test("Microsoft pagination accepts only Graph v1 links",()=>{assert.equal(isAllowedMicrosoftGraphNextLink("https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=safe"),true);assert.equal(isAllowedMicrosoftGraphNextLink("https://evil.example/v1.0/me/calendars"),false);assert.equal(isAllowedMicrosoftGraphNextLink("https://graph.microsoft.com/beta/me/calendars"),false);assert.equal(isAllowedMicrosoftGraphNextLink(null),false);});
test("Microsoft event times are normalized as UTC",()=>{assert.equal(microsoftDateTime({dateTime:"2026-08-23T12:30:00"})?.toISOString(),"2026-08-23T12:30:00.000Z");assert.equal(microsoftDateTime({dateTime:"2026-08-23T12:30:00-05:00"})?.toISOString(),"2026-08-23T17:30:00.000Z");assert.equal(microsoftDateTime({}),null);});
