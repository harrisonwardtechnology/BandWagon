import assert from "node:assert/strict";
import test from "node:test";
import { calendarConflictMode,classifyCalendarConflict,normalizedCalendarTitle } from "../src/lib/calendar-conflict-policy.ts";
test("calendar titles normalize common punctuation and spacing",()=>{assert.equal(normalizedCalendarTitle("  Friday - Football Game! "),"friday football game");});
test("exact cross-provider duplicates are detected within one minute",()=>{assert.equal(classifyCalendarConflict({title:"Band Practice",startsAt:"2026-08-23T18:00:00Z",endsAt:"2026-08-23T20:00:00Z"},{title:"Band-Practice",startsAt:"2026-08-23T18:00:30Z",endsAt:"2026-08-23T20:00:00Z"}),"exact_duplicate");});
test("same-title overlaps are flagged while unrelated events remain separate",()=>{assert.equal(classifyCalendarConflict({title:"Practice",startsAt:"2026-08-23T18:00:00Z",endsAt:"2026-08-23T20:00:00Z"},{title:"Practice",startsAt:"2026-08-23T19:00:00Z",endsAt:"2026-08-23T21:00:00Z"}),"potential_overlap");assert.equal(classifyCalendarConflict({title:"Practice",startsAt:"2026-08-23T18:00:00Z"},{title:"Dinner",startsAt:"2026-08-23T18:00:00Z"}),null);assert.equal(calendarConflictMode("unknown"),"merge_exact");});
