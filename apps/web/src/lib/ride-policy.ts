export const RIDE_STATUSES = [
  "confirmed",
  "driver_en_route",
  "arrived",
  "picked_up",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

const transitions: Record<RideStatus, readonly RideStatus[]> = {
  confirmed: ["driver_en_route", "cancelled", "no_show"],
  driver_en_route: ["arrived", "cancelled"],
  arrived: ["picked_up", "no_show", "cancelled"],
  picked_up: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const driverOnlyTransitions = new Set<RideStatus>([
  "driver_en_route",
  "arrived",
  "picked_up",
  "completed",
  "no_show",
]);

export function canTransitionRide(fromStatus: string, toStatus: string) {
  return Boolean(
    transitions[fromStatus as RideStatus]?.includes(toStatus as RideStatus)
  );
}

export function assertRideTransition(fromStatus: string, toStatus: string) {
  if (!canTransitionRide(fromStatus, toStatus)) {
    throw new Error(`Invalid ride transition: ${fromStatus} -> ${toStatus}`);
  }
}

export function canActorTransitionRide(input: {
  actorIsDriver: boolean;
  actorManagesPrimary: boolean;
  toStatus: string;
}) {
  if (!input.actorIsDriver && !input.actorManagesPrimary) return false;
  if (driverOnlyTransitions.has(input.toStatus as RideStatus)) {
    return input.actorIsDriver;
  }
  return true;
}

export function requestStatusAfterRideCancellation(input: {
  prePickup: boolean;
  driverCancelled: boolean;
  isPrimary: boolean;
}) {
  if (input.prePickup && (input.driverCancelled || !input.isPrimary)) return "open";
  return "cancelled";
}

export function canEndPooledRideAsNoShow(assignmentCount: number) {
  return assignmentCount <= 1;
}
