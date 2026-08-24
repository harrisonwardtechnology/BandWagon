import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRideTransition,
  canActorTransitionRide,
  canEndPooledRideAsNoShow,
  canTransitionRide,
  requestStatusAfterRideCancellation,
} from "../src/lib/ride-policy.ts";

test("ride lifecycle allows only declared forward and terminal transitions", () => {
  assert.equal(canTransitionRide("confirmed", "driver_en_route"), true);
  assert.equal(canTransitionRide("driver_en_route", "arrived"), true);
  assert.equal(canTransitionRide("arrived", "picked_up"), true);
  assert.equal(canTransitionRide("picked_up", "completed"), true);
  assert.equal(canTransitionRide("completed", "confirmed"), false);
  assert.equal(canTransitionRide("cancelled", "driver_en_route"), false);
  assert.throws(
    () => assertRideTransition("confirmed", "completed"),
    /Invalid ride transition/
  );
});

test("only the assigned driver performs driving-state transitions", () => {
  assert.equal(
    canActorTransitionRide({ actorIsDriver: true, actorManagesPrimary: false, toStatus: "picked_up" }),
    true
  );
  assert.equal(
    canActorTransitionRide({ actorIsDriver: false, actorManagesPrimary: true, toStatus: "picked_up" }),
    false
  );
  assert.equal(
    canActorTransitionRide({ actorIsDriver: false, actorManagesPrimary: true, toStatus: "cancelled" }),
    true
  );
  assert.equal(
    canActorTransitionRide({ actorIsDriver: false, actorManagesPrimary: false, toStatus: "cancelled" }),
    false
  );
});

test("pre-pickup cancellations reopen affected requests safely", () => {
  assert.equal(
    requestStatusAfterRideCancellation({ prePickup: true, driverCancelled: true, isPrimary: true }),
    "open"
  );
  assert.equal(
    requestStatusAfterRideCancellation({ prePickup: true, driverCancelled: false, isPrimary: false }),
    "open"
  );
  assert.equal(
    requestStatusAfterRideCancellation({ prePickup: true, driverCancelled: false, isPrimary: true }),
    "cancelled"
  );
  assert.equal(
    requestStatusAfterRideCancellation({ prePickup: false, driverCancelled: true, isPrimary: true }),
    "cancelled"
  );
});

test("a pooled ride cannot be ended as one passenger no-show", () => {
  assert.equal(canEndPooledRideAsNoShow(1), true);
  assert.equal(canEndPooledRideAsNoShow(2), false);
});
