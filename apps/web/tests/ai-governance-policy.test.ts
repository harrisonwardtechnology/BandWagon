import assert from "node:assert/strict";
import test from "node:test";
import { aiRequestTimeoutMs,aiReservationMicrousd,aiRuntimeEnabled,allowedAiModels,budgetAllows,centsToMicrousd } from "../src/lib/ai-governance-policy.ts";

test("AI runtime is fail closed and accepts only explicit true",()=>{assert.equal(aiRuntimeEnabled(undefined),false);assert.equal(aiRuntimeEnabled("TRUE"),true);assert.equal(aiRuntimeEnabled("1"),false);});
test("AI budgets use microdollars and include the pending reservation",()=>{assert.equal(centsToMicrousd(25),250_000);assert.equal(budgetAllows({budgetMicrousd:1_000_000,committedAndReservedMicrousd:800_000,requestedReservationMicrousd:200_000}),true);assert.equal(budgetAllows({budgetMicrousd:1_000_000,committedAndReservedMicrousd:800_001,requestedReservationMicrousd:200_000}),false);assert.equal(budgetAllows({budgetMicrousd:0,committedAndReservedMicrousd:0,requestedReservationMicrousd:0}),false);});
test("AI timeouts, reservations, and model aliases stay bounded",()=>{assert.equal(aiRequestTimeoutMs(undefined),30_000);assert.equal(aiRequestTimeoutMs(999_999),120_000);assert.equal(aiReservationMicrousd(-1),10_000);assert.deepEqual([...allowedAiModels({...process.env,AI_FAST_MODEL:"fast"})], ["fast",process.env.AI_BALANCED_MODEL||"bandwagon-balanced",process.env.AI_DEEP_MODEL||"bandwagon-deep"]);});
