import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  formatPhoneAsYouType,
  formatPhoneForDisplay,
  normalizePhoneInput,
} from "../src/lib/phone-format.ts";

test("ordinary US phone entry displays nationally and normalizes internationally", () => {
  assert.equal(formatPhoneAsYouType("4695550147", "US"), "(469) 555-0147");
  assert.equal(normalizePhoneInput("4695550147", "US"), "+14695550147");
  assert.equal(normalizePhoneInput("(469) 555-0147", "US"), "+14695550147");
  assert.equal(formatPhoneForDisplay("+14695550147", "US"), "(469) 555-0147");
});

test("country selection supports international local entry without teaching E.164", () => {
  assert.equal(normalizePhoneInput("07400 123456", "GB"), "+447400123456");
  assert.equal(formatPhoneForDisplay("+447400123456", "GB"), "07400 123456");
});

test("phone control uses a country picker and login separates email from mobile", () => {
  const component = fs.readFileSync("src/components/phone-number-input.tsx", "utf8");
  const login = fs.readFileSync("src/app/login/page.tsx", "utf8");
  assert.match(component, /Phone country or region/);
  assert.match(component, /country code is added automatically/i);
  assert.match(component, /normalizePhoneInput/);
  assert.match(login, /Mobile Phone/);
  assert.doesNotMatch(login, /\+14695551212/);
});
