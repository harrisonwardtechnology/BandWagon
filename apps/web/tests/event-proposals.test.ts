import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  approvedEventInput,
  assertProposalTransition,
  canManageProposalSettings,
  canModerateProposals,
  nextProposalStatus,
  OPEN_PROPOSALS_MAX,
  PROPOSALS_PER_DAY,
  proposalSubmitDenial,
  proposerScope,
  stripHtml,
  validateModeratorNote,
  validateProposalInput,
} from "../src/lib/event-proposal-policy.ts";

const NOW = new Date("2026-09-27T12:00:00Z");
const eligible = {
  moduleEnabled: true,
  scope: "adult_members",
  personType: "adult",
  isActiveMember: true,
  isGuardianInOrganization: false,
  submittedLast24h: 0,
  openCount: 0,
};

test("module off blocks submit, even for eligible adults", () => {
  assert.match(proposalSubmitDenial({ ...eligible, moduleEnabled: false }) || "", /not accepting event proposals/);
  assert.equal(proposalSubmitDenial(eligible), null);
});

test("minors can never propose, in any scope", () => {
  for (const scope of ["adult_members", "guardians_only"]) {
    const reason = proposalSubmitDenial({ ...eligible, scope, personType: "minor", isGuardianInOrganization: true });
    assert.match(reason || "", /Only adults can propose events/);
  }
  assert.ok(proposalSubmitDenial({ ...eligible, personType: null }));
  assert.ok(proposalSubmitDenial({ ...eligible, personType: "unknown" }));
});

test("guardians-only scope requires a guardian of a student in the organization", () => {
  assert.match(proposalSubmitDenial({ ...eligible, scope: "guardians_only" }) || "", /parents and guardians/);
  assert.equal(proposalSubmitDenial({ ...eligible, scope: "guardians_only", isGuardianInOrganization: true }), null);
  assert.equal(proposerScope("bogus"), "adult_members");
  assert.equal(proposerScope(undefined), "adult_members");
});

test("non-members and Support View cannot submit", () => {
  assert.match(proposalSubmitDenial({ ...eligible, isActiveMember: false }) || "", /active members/);
  assert.match(proposalSubmitDenial({ ...eligible, supportMode: true }) || "", /Support View/);
});

test("rate limits apply to new submissions but not to resubmitting a change request", () => {
  assert.match(proposalSubmitDenial({ ...eligible, submittedLast24h: PROPOSALS_PER_DAY }) || "", /a day/);
  assert.match(proposalSubmitDenial({ ...eligible, openCount: OPEN_PROPOSALS_MAX }) || "", /waiting for review/);
  assert.equal(proposalSubmitDenial({ ...eligible, submittedLast24h: PROPOSALS_PER_DAY, openCount: OPEN_PROPOSALS_MAX, resubmitting: true }), null);
  assert.ok(proposalSubmitDenial({ ...eligible, moduleEnabled: false, resubmitting: true }), "module off still blocks resubmits");
});

test("state machine allows only the documented transitions", () => {
  assert.equal(nextProposalStatus("pending", "approve"), "approved");
  assert.equal(nextProposalStatus("pending", "request_changes"), "changes_requested");
  assert.equal(nextProposalStatus("pending", "decline"), "declined");
  assert.equal(nextProposalStatus("pending", "withdraw"), "withdrawn");
  assert.equal(nextProposalStatus("pending", "resubmit"), null);
  assert.equal(nextProposalStatus("changes_requested", "resubmit"), "pending");
  assert.equal(nextProposalStatus("changes_requested", "decline"), "declined");
  assert.equal(nextProposalStatus("changes_requested", "withdraw"), "withdrawn");
  assert.equal(nextProposalStatus("changes_requested", "approve"), null, "a changed proposal must be resubmitted before approval");
  for (const terminal of ["approved", "declined", "withdrawn"]) {
    for (const action of ["submit", "resubmit", "withdraw", "approve", "request_changes", "decline"] as const) {
      assert.equal(nextProposalStatus(terminal, action), null, `${terminal} -> ${action}`);
    }
  }
  assert.equal(nextProposalStatus("nonsense", "approve"), null);
  assert.throws(() => assertProposalTransition("approved", "approve"), /approved and can no longer be changed/);
  assert.equal(assertProposalTransition("pending", "approve"), "approved");
});

test("only organizer roles moderate; only owners and admins change settings", () => {
  for (const role of ["owner", "admin", "manager"]) assert.equal(canModerateProposals(role), true);
  for (const role of ["member", "driver", "student", null, undefined]) assert.equal(canModerateProposals(role), false);
  assert.equal(canModerateProposals(null, true), true);
  assert.equal(canManageProposalSettings("owner"), true);
  assert.equal(canManageProposalSettings("admin"), true);
  assert.equal(canManageProposalSettings("manager"), false);
  assert.equal(canManageProposalSettings("member"), false);
});

test("input is stripped of HTML and length limited", () => {
  assert.equal(stripHtml("<b>Band</b> <script>alert(1)</script>practice"), "Band practice");
  assert.equal(stripHtml("Line one<br>\n\n\n\nLine two", { multiline: true }), "Line one\n\nLine two");
  assert.equal(stripHtml("a < b > c"), "a b c");
  const fields = validateProposalInput({
    title: "  <i>Sectionals</i>  ",
    description: "<p>Bring water</p>",
    locationName: "FMHS <img src=x onerror=alert(1)>Stadium",
    startsAt: "2026-10-01T15:00:00Z",
    endsAt: "2026-10-01T17:00:00Z",
    expectedRiders: "12",
    notes: "",
  }, NOW);
  assert.equal(fields.title, "Sectionals");
  assert.equal(fields.description, "Bring water");
  assert.equal(fields.locationName, "FMHS Stadium");
  assert.equal(fields.expectedRiders, 12);
  assert.equal(fields.notes, null);
  assert.throws(() => validateProposalInput({ title: "x".repeat(121), startsAt: "2026-10-01T15:00:00Z" }, NOW), /120 characters/);
  assert.throws(() => validateProposalInput({ title: "<b></b>", startsAt: "2026-10-01T15:00:00Z" }, NOW), /Event name is required/);
  assert.throws(() => validateProposalInput({ title: "ok", startsAt: "2026-09-01T15:00:00Z" }, NOW), /future/);
  assert.throws(() => validateProposalInput({ title: "ok", startsAt: "2026-10-01T15:00:00Z", endsAt: "2026-10-01T14:00:00Z" }, NOW), /after the start/);
  assert.throws(() => validateProposalInput({ title: "ok", startsAt: "2026-10-01T15:00:00Z", expectedRiders: 2.5 }, NOW), /whole number/);
  assert.throws(() => validateProposalInput({ title: "ok", startsAt: "2026-10-01T15:00:00Z", expectedRiders: 501 }, NOW), /whole number/);
  assert.throws(() => validateProposalInput({ title: "ok" }, NOW), /Start date/);
});

test("declining or asking for changes needs a note", () => {
  assert.throws(() => validateModeratorNote("", "decline"), /reason/);
  assert.throws(() => validateModeratorNote("<b></b>", "request_changes"), /what to change/);
  assert.equal(validateModeratorNote("Please add an <em>end</em> time", "request_changes"), "Please add an end time");
});

test("approval input credits the proposer, records the moderator, and never widens visibility", () => {
  const proposal = { ...validateProposalInput({ title: "Car wash", startsAt: "2026-10-01T15:00:00Z" }, NOW), proposerPersonId: "proposer-1" };
  const input = approvedEventInput({ organizationId: "org-1", proposal, moderatorPersonId: "mod-1", visibility: "group" });
  assert.equal(input.proposedByPersonId, "proposer-1");
  assert.equal(input.createdByPersonId, "mod-1");
  assert.equal(input.organizationId, "org-1");
  assert.equal(input.visibility, "organization");
  assert.equal(input.rideCoordinationEnabled, true);
  assert.equal(approvedEventInput({ organizationId: "org-1", proposal, moderatorPersonId: "mod-1", visibility: "private", rideCoordinationEnabled: false }).visibility, "private");
  const edited = approvedEventInput({ organizationId: "org-1", proposal, moderatorPersonId: "mod-1", edits: { title: "Band car wash", description: undefined } });
  assert.equal(edited.title, "Band car wash");
});

test("approval goes through the manual event creation path inside the moderation transaction", async () => {
  const source = await readFile(new URL("../src/lib/event-proposals.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ createManualEvent \} from "@\/lib\/events"/);
  assert.match(source, /createManualEvent\(\{ \.\.\.eventInput[^)]*\}, \{ client \}\)/);
  assert.doesNotMatch(source, /insert\s+into\s+events\b/i, "proposals must not insert events directly");
  assert.doesNotMatch(source, /db\.query\(\s*["'`]BEGIN/i, "transactions must use a dedicated client");
  const events = await readFile(new URL("../src/lib/events.ts", import.meta.url), "utf8");
  assert.match(events, /options\.client \|\| getDb\(\)/);
  assert.match(events, /proposed_by_person_id/);
});

test("every proposal decision writes an audit event", async () => {
  const source = await readFile(new URL("../src/lib/event-proposals.ts", import.meta.url), "utf8");
  for (const action of ["event_proposal.submitted", "event_proposal.approved", "event_proposal.declined", "event_proposal.changes_requested", "event_proposal.resubmitted", "event_proposal.withdrawn"]) {
    assert.ok(source.includes(action), `missing audit action ${action}`);
  }
});

test("proposal UI copy avoids em dashes", async () => {
  for (const path of ["../src/app/app/event-proposals/page.tsx", "../src/app/admin/event-proposals/page.tsx", "../src/lib/event-proposal-policy.ts", "../src/lib/event-proposals.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(!source.includes("—"), `${path} contains an em dash`);
  }
});

test("migration keeps the module off by default", async () => {
  const sql = await readFile(new URL("../database/migrations/060_event_proposals.sql", import.meta.url), "utf8");
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /proposer_scope text NOT NULL DEFAULT 'adult_members'/);
});

test("a proposal whose start time has passed gets a clear message instead of a generic error", async () => {
  const { PAST_PROPOSAL_APPROVE_MESSAGE, proposalModerationBlock, proposalStartHasPassed } = await import("../src/lib/event-proposal-policy.ts");
  const now = new Date("2026-10-04T12:00:00Z");
  assert.equal(proposalStartHasPassed("2026-10-03T12:00:00Z", now), true);
  assert.equal(proposalStartHasPassed(new Date("2026-10-04T12:00:00Z"), now), true);
  assert.equal(proposalStartHasPassed("2026-10-05T12:00:00Z", now), false);
  assert.equal(proposalStartHasPassed("not a date", now), false);
  assert.equal(proposalStartHasPassed(null, now), false);

  const past = "2026-10-01T18:00:00Z";
  const future = "2026-10-20T18:00:00Z";
  assert.equal(proposalModerationBlock({ action: "approve", moduleEnabled: true, startsAt: past, now }), PAST_PROPOSAL_APPROVE_MESSAGE);
  assert.match(PAST_PROPOSAL_APPROVE_MESSAGE, /start time has already passed/);
  assert.match(PAST_PROPOSAL_APPROVE_MESSAGE, /Change the date and time to approve it, or decline it/);
  // Once the moderator picks a new date, approval goes ahead.
  assert.equal(proposalModerationBlock({ action: "approve", moduleEnabled: true, startsAt: future, now }), null);
  // A past date never stops declining or asking the proposer to fix it.
  assert.equal(proposalModerationBlock({ action: "decline", moduleEnabled: true, startsAt: past, now }), null);
  assert.equal(proposalModerationBlock({ action: "request_changes", moduleEnabled: true, startsAt: past, now }), null);
});

test("turning proposals off puts queued proposals on hold without deleting them", async () => {
  const { PROPOSALS_OFF_REVIEW_MESSAGE, proposalModerationBlock, proposalsOffNotice } = await import("../src/lib/event-proposal-policy.ts");
  const now = new Date("2026-10-04T12:00:00Z");
  const future = "2026-10-20T18:00:00Z";
  // Nothing is published and nobody is asked to resend while the feature is off.
  assert.equal(proposalModerationBlock({ action: "approve", moduleEnabled: false, startsAt: future, now }), PROPOSALS_OFF_REVIEW_MESSAGE);
  assert.equal(proposalModerationBlock({ action: "request_changes", moduleEnabled: false, startsAt: future, now }), PROPOSALS_OFF_REVIEW_MESSAGE);
  // The queue can always be cleared by declining.
  assert.equal(proposalModerationBlock({ action: "decline", moduleEnabled: false, startsAt: future, now }), null);
  assert.match(PROPOSALS_OFF_REVIEW_MESSAGE, /turned off/);
  assert.match(PROPOSALS_OFF_REVIEW_MESSAGE, /on hold/);

  assert.equal(proposalsOffNotice(0), null);
  assert.equal(proposalsOffNotice(1), "Event proposals are off. 1 proposal is still in the queue. It's on hold, not deleted: decline now, or turn proposals back on to approve or ask for changes.");
  assert.match(proposalsOffNotice(3) || "", /3 proposals are still in the queue\. They're on hold, not deleted/);

  const lib = await readFile(new URL("../src/lib/event-proposals.ts", import.meta.url), "utf8");
  // The check runs inside the moderation transaction, before any event is created or status changed.
  const moderate = lib.slice(lib.indexOf("export async function moderateEventProposal"));
  const block = moderate.indexOf("proposalModerationBlock({");
  assert.ok(block > 0 && block < moderate.indexOf("createManualEvent("), "the hold is checked before publishing");
  assert.ok(block < moderate.indexOf("update event_proposals set status=$2"), "the hold is checked before the status changes");
  assert.match(moderate, /if \(block\) throw new Error\(block\);/);
  // Turning the feature off counts the queue and tells the admin. It never deletes or closes proposals.
  const settings = lib.slice(lib.indexOf("export async function updateEventProposalSettings"), lib.indexOf("async function proposerFacts"));
  assert.match(settings, /proposalsOffNotice\(openProposals\)/);
  assert.doesNotMatch(settings, /delete from event_proposals|update event_proposals/);
  assert.match(lib, /\(ep\.status='pending' and ep\.starts_at<=now\(\)\) as start_passed/);
  const route = await readFile(new URL("../src/app/api/admin/event-proposals/route.ts", import.meta.url), "utf8");
  assert.match(route, /notice: settings\.notice/);
});
