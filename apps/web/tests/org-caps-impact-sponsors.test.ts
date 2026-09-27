import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  decideOrgMobileCap,
  defaultOrgMonthlySmsCapCents,
  effectiveOrgCapCents,
  isCapExempt,
  normalizeAlertThresholdPercent,
  ORG_TEXTING_LIMIT_ERROR,
  reachedAlertThresholds,
  usagePercent,
  utcMonthWindow,
} from "../src/lib/org-messaging-cap-policy.ts";
import {
  displayCount,
  displayDerived,
  impactCsv,
  impactEstimates,
  impactPeriods,
  isSuppressed,
  publicImpactRow,
  schoolYearStart,
} from "../src/lib/impact-policy.ts";
import { isPubliclyVisibleSponsor, normalizeHttpsUrl, safeHttpsUrlOrNull, validateSponsorInput } from "../src/lib/sponsor-policy.ts";

const ORG = "00000000-0000-0000-0000-000000000001";

test("platform default texting cap comes from env with a $25 fallback", () => {
  assert.equal(defaultOrgMonthlySmsCapCents(undefined), 2500);
  assert.equal(defaultOrgMonthlySmsCapCents(""), 2500);
  assert.equal(defaultOrgMonthlySmsCapCents("abc"), 2500);
  assert.equal(defaultOrgMonthlySmsCapCents("-5"), 2500);
  assert.equal(defaultOrgMonthlySmsCapCents("5000"), 5000);
  assert.equal(defaultOrgMonthlySmsCapCents("0"), 0);
  assert.equal(effectiveOrgCapCents(null, 2500), 2500);
  assert.equal(effectiveOrgCapCents(10000, 2500), 10000);
  assert.equal(effectiveOrgCapCents(0, 2500), 0);
  assert.equal(normalizeAlertThresholdPercent(150), 99);
  assert.equal(normalizeAlertThresholdPercent("x"), 80);
});

test("under the cap every urgency is allowed", () => {
  for (const urgency of ["routine", "important", "critical"] as const) {
    const d = decideOrgMobileCap({ organizationId: ORG, urgency, notificationType: "ride_matched", usedCents: 100, requestedCents: 1.25, capCents: 2500 });
    assert.equal(d.allowed, true);
    assert.equal(d.overCap, false);
  }
});

test("over the cap routine and important are blocked with a clear error", () => {
  for (const urgency of ["routine", "important"] as const) {
    const d = decideOrgMobileCap({ organizationId: ORG, urgency, notificationType: "reminder_1h", usedCents: 2499, requestedCents: 1.25, capCents: 2500 });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, ORG_TEXTING_LIMIT_ERROR);
    assert.equal(ORG_TEXTING_LIMIT_ERROR, "Organization monthly texting limit reached");
  }
  // Exactly reaching the cap is still allowed; exceeding it is not.
  assert.equal(decideOrgMobileCap({ organizationId: ORG, urgency: "routine", notificationType: "x", usedCents: 2498.75, requestedCents: 1.25, capCents: 2500 }).allowed, true);
  // A zero cap blocks all non-exempt texting for that organization.
  assert.equal(decideOrgMobileCap({ organizationId: ORG, urgency: "important", notificationType: "x", usedCents: 0, requestedCents: 1.25, capCents: 0 }).allowed, false);
});

test("critical urgency and OTP are always allowed over the cap but still counted", () => {
  const critical = decideOrgMobileCap({ organizationId: ORG, urgency: "critical", notificationType: "safety_alert", usedCents: 9999, requestedCents: 1.25, capCents: 2500 });
  assert.equal(critical.allowed, true);
  assert.equal(critical.exempt, true);
  assert.equal(critical.overCap, true);
  assert.equal(critical.projectedCents, 10000.25);
  const otp = decideOrgMobileCap({ organizationId: ORG, urgency: "important", notificationType: "otp", usedCents: 9999, requestedCents: 1.25, capCents: 2500 });
  assert.equal(otp.allowed, true);
  assert.equal(isCapExempt({ urgency: "critical", notificationType: "driver_arriving" }), true);
  assert.equal(isCapExempt({ urgency: "routine", notificationType: "reminder_24h" }), false);
});

test("messages without an organization are not org-capped", () => {
  const d = decideOrgMobileCap({ organizationId: null, urgency: "routine", notificationType: "platform_test", usedCents: 1e9, requestedCents: 1, capCents: 0 });
  assert.equal(d.allowed, true);
  assert.equal(d.capped, false);
});

test("threshold alert math fires at the alert percent and at 100 percent", () => {
  assert.deepEqual(reachedAlertThresholds({ usedCents: 1999, capCents: 2500 }), []);
  assert.deepEqual(reachedAlertThresholds({ usedCents: 2000, capCents: 2500 }), [80]);
  assert.deepEqual(reachedAlertThresholds({ usedCents: 2500, capCents: 2500 }), [80, 100]);
  assert.deepEqual(reachedAlertThresholds({ usedCents: 3000, capCents: 2500, alertThresholdPercent: 50 }), [50, 100]);
  assert.deepEqual(reachedAlertThresholds({ usedCents: 1, capCents: 0 }), [80, 100]);
  assert.deepEqual(reachedAlertThresholds({ usedCents: 0, capCents: 0 }), []);
  assert.equal(usagePercent(1250, 2500), 50);
  assert.equal(usagePercent(1, 3), 33.3);
});

test("usage months follow UTC calendar boundaries", () => {
  const lastSecond = utcMonthWindow(new Date("2026-01-31T23:59:59.999Z"));
  assert.equal(lastSecond.monthKey, "2026-01-01");
  assert.equal(lastSecond.end.toISOString(), "2026-02-01T00:00:00.000Z");
  const firstSecond = utcMonthWindow(new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(firstSecond.monthKey, "2026-02-01");
  assert.equal(firstSecond.start.toISOString(), "2026-02-01T00:00:00.000Z");
  const december = utcMonthWindow(new Date("2026-12-15T12:00:00Z"));
  assert.equal(december.end.toISOString(), "2027-01-01T00:00:00.000Z");
  const leap = utcMonthWindow(new Date("2028-02-29T10:00:00Z"));
  assert.equal(leap.end.toISOString(), "2028-03-01T00:00:00.000Z");
});

test("impact formulas are conservative and documented", () => {
  const e = impactEstimates({ avoidedTrips: 100 });
  assert.equal(e.milesPerTrip, 5);
  assert.equal(e.vehicleMilesAvoided, 500);
  assert.equal(e.drivingHoursSaved, 25);
  assert.equal(e.co2KgAvoided, 200); // 500 miles x 400 g
  const custom = impactEstimates({ avoidedTrips: 10, milesPerTrip: 3, minutesPerTrip: 12 });
  assert.equal(custom.vehicleMilesAvoided, 30);
  assert.equal(custom.drivingHoursSaved, 2);
  assert.equal(custom.co2KgAvoided, 12);
  assert.equal(impactEstimates({ avoidedTrips: 10, milesPerTrip: 9999 }).milesPerTrip, 50);
  assert.equal(impactEstimates({ avoidedTrips: -3 }).vehicleMilesAvoided, 0);
});

test("small numbers are shown as fewer than 5", () => {
  assert.equal(displayCount(0), "0");
  for (const n of [1, 2, 3, 4]) {
    assert.equal(isSuppressed(n), true);
    assert.equal(displayCount(n), "fewer than 5");
  }
  assert.equal(displayCount(5), "5");
  assert.equal(displayCount(1234), "1,234");
  assert.equal(displayDerived(20, 4, "miles"), "not shown for small numbers");
  assert.equal(displayDerived(25, 5, "miles"), "25 miles");
  const row = publicImpactRow({ completedRides: 3, ridersServed: 12, seatsShared: 2, avoidedTrips: 4, activeDrivers: 1, familiesParticipating: 9 });
  assert.equal(row.completedRides, "fewer than 5");
  assert.equal(row.ridersServed, "12");
  assert.equal(row.vehicleMilesAvoided, "not shown for small numbers");
  assert.equal(row.co2KgAvoided, "not shown for small numbers");
  assert.equal(row.activeDrivers, "fewer than 5");
  // No exact small count leaks through any field.
  assert.doesNotMatch(JSON.stringify(row), /"[1-4]"/);
});

test("school year runs August 1 to July 31", () => {
  assert.equal(schoolYearStart(new Date("2026-07-31T23:59:59Z")).toISOString(), "2025-08-01T00:00:00.000Z");
  assert.equal(schoolYearStart(new Date("2026-08-01T00:00:00Z")).toISOString(), "2026-08-01T00:00:00.000Z");
  const periods = impactPeriods(new Date("2026-09-26T12:00:00Z"));
  assert.deepEqual(periods.map((p) => p.key), ["month", "school_year", "all_time"]);
  assert.equal(periods[1].label, "School year 2026-27");
  assert.equal(periods[2].start, null);
});

test("impact CSV is quoted and neutralizes spreadsheet formulas", () => {
  const csv = impactCsv({ organizationName: "=HYPERLINK(\"x\")", generatedAt: "2026-09-26", milesPerTrip: 5, minutesPerTrip: 15, rows: [{ label: "All time", display: publicImpactRow({ completedRides: 10, ridersServed: 2, seatsShared: 20, avoidedTrips: 10, activeDrivers: 6, familiesParticipating: 7 }) }] });
  assert.match(csv, /"All time","10","fewer than 5","20","10","50 miles","2\.5 hours","20 kg CO2","6","7"/);
  assert.doesNotMatch(csv, /^"=/m);
  assert.match(csv, /BandWagon impact report: =HYPERLINK/); // inside a cell, not at cell start
});

test("sponsor URLs must be plain https", () => {
  assert.equal(normalizeHttpsUrl(""), null);
  assert.equal(normalizeHttpsUrl("https://example.com"), "https://example.com/");
  assert.equal(normalizeHttpsUrl("https://shop.example.com/logo.png"), "https://shop.example.com/logo.png");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "http://example.com", "data:image/png;base64,AAAA", "https://user:pass@example.com", "//example.com", "https://localhost", "https://exa mple.com", "https://example.com/\"onerror=x", "ftp://example.com"]) {
    assert.throws(() => normalizeHttpsUrl(bad), Error, bad);
    assert.equal(safeHttpsUrlOrNull(bad), null);
  }
  assert.throws(() => normalizeHttpsUrl(`https://example.com/${"a".repeat(600)}`), /500 characters/);
});

test("sponsor input caps text lengths and validates dates", () => {
  const ok = validateSponsorInput({ sponsorName: "  Main Street   Pizza ", sponsorWebsite: "https://pizza.example", logoUrl: "", tierLabel: "Gold", publicDisplay: true, startsAt: "2026-08-01", endsAt: "2027-07-31", internalNotes: "Paid by check" });
  assert.equal(ok.sponsorName, "Main Street Pizza");
  assert.equal(ok.logoUrl, null);
  assert.equal(ok.publicDisplay, true);
  assert.throws(() => validateSponsorInput({ sponsorName: "" }), /name is required/);
  assert.throws(() => validateSponsorInput({ sponsorName: "x".repeat(121) }), /120 characters/);
  assert.throws(() => validateSponsorInput({ sponsorName: "A", tierLabel: "x".repeat(41) }), /40 characters/);
  assert.throws(() => validateSponsorInput({ sponsorName: "A", internalNotes: "x".repeat(2001) }), /2000 characters/);
  assert.throws(() => validateSponsorInput({ sponsorName: "A", startsAt: "2026-09-01", endsAt: "2026-08-01" }), /End date/);
  assert.throws(() => validateSponsorInput({ sponsorName: "A", sponsorWebsite: "javascript:alert(1)" }), /https/);
  assert.equal(validateSponsorInput({ sponsorName: "A" }).publicDisplay, false);
});

test("public sponsor visibility respects status, toggle, and dates", () => {
  const now = new Date("2026-09-26T00:00:00Z");
  assert.equal(isPubliclyVisibleSponsor({ status: "active", public_display: true, starts_at: "2026-01-01", ends_at: null }, now), true);
  assert.equal(isPubliclyVisibleSponsor({ status: "ended", public_display: true, starts_at: "2026-01-01" }, now), false);
  assert.equal(isPubliclyVisibleSponsor({ status: "active", public_display: false, starts_at: "2026-01-01" }, now), false);
  assert.equal(isPubliclyVisibleSponsor({ status: "active", public_display: true, starts_at: "2026-10-01" }, now), false);
  assert.equal(isPubliclyVisibleSponsor({ status: "active", public_display: true, starts_at: "2026-01-01", ends_at: "2026-09-25" }, now), false);
});

test("the organization cap is checked inside the locked reservation transaction", async () => {
  const source = await readFile(new URL("../src/lib/twilio-send.ts", import.meta.url), "utf8");
  const begin = source.indexOf('await client.query("BEGIN")');
  const recipientLock = source.indexOf("bandwagon:mobile:", begin);
  const orgLock = source.indexOf("bandwagon:org-mobile:", recipientLock);
  const usage = source.indexOf("sum(estimated_cost_cents)", orgLock);
  const decision = source.indexOf("decideOrgMobileCap(", usage);
  const blocked = source.indexOf("throw new OrgTextingLimitError()", decision);
  const reservation = source.indexOf("values ($1,$2,$3,$4,$5,'reserved'", blocked);
  const commit = source.indexOf('await client.query("COMMIT")', reservation);
  const carrier = source.indexOf("response = await fetch(endpoint", commit);
  assert.ok(begin >= 0 && begin < recipientLock, "transaction begins before locks");
  assert.ok(recipientLock < orgLock, "recipient lock then organization lock (fixed order)");
  assert.ok(orgLock < usage && usage < decision && decision < blocked, "usage is summed and decided under the org lock");
  assert.ok(blocked < reservation && reservation < commit && commit < carrier, "reservation commits before the carrier call");
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)", \[`bandwagon:org-mobile:\$\{input\.organizationId\}`\]/);
});

test("the router still falls back to email when the texting limit pauses a message", async () => {
  const source = await readFile(new URL("../src/lib/notification-router.ts", import.meta.url), "utf8");
  assert.match(source, /catch\(error\)\{result\.messaging\.error=/);
  assert.match(source, /smsPausedByOrgLimit=result\.messaging\.error===ORG_TEXTING_LIMIT_ERROR/);
  assert.match(source, /\(smsPausedByOrgLimit&&!pushAvailable\)/);
});

test("sponsor surfaces keep the funding boundary and never expose payer email", async () => {
  const lib = await readFile(new URL("../src/lib/org-sponsors.ts", import.meta.url), "utf8");
  assert.match(lib, /Core Funding Boundary/);
  assert.doesNotMatch(lib, /stripe_customer_email/);
  assert.doesNotMatch(lib, /ride_passengers|ride_requests|private_locations|phones|emails/);
  const page = await readFile(new URL("../src/app/admin/sponsors/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Never any participant data/);
  const stripe = await readFile(new URL("../src/lib/stripe-support.ts", import.meta.url), "utf8");
  assert.match(stripe, /safeHttpsUrlOrNull\(contribution\.sponsor_website\)/);
  const publicPage = await readFile(new URL("../src/app/impact/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(publicPage, /notFound\(\)/);
  const impact = await readFile(new URL("../src/lib/org-impact.ts", import.meta.url), "utf8");
  assert.match(impact, /public_impact_enabled=true/);
});

test("user-facing copy for these features avoids em dashes", async () => {
  for (const file of ["../src/app/admin/usage/page.tsx", "../src/app/admin/impact/page.tsx", "../src/app/admin/sponsors/page.tsx", "../src/app/admin/sponsors/packet/page.tsx", "../src/app/impact/[slug]/page.tsx", "../src/lib/impact-policy.ts", "../src/lib/org-messaging-limits.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /—/, file);
  }
});
