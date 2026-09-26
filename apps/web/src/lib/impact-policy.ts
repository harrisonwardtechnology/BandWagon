// Pure impact math and small-number privacy rules for organization impact
// reports. No imports: this file is exercised directly by node --test.
//
// Formulas are intentionally conservative:
//
// Avoided vehicle trip
//   One avoided trip per ride request served on a completed carpool where the
//   requesting family is not the driver's own household. Siblings on one
//   request count once (one family, one car). A round-trip request counts as
//   one trip, not two. Rides with no-shows or cancellations are not counted.
//
// Vehicle miles avoided = avoided trips x miles per avoided trip.
//   BandWagon does not store per-ride route distance (exact locations are
//   private and encrypted), so we use a documented per-trip default of 5 miles,
//   which an organization admin may lower or raise (1 to 50) to match its area.
//   Driver detours are not subtracted separately; the low default absorbs them.
//
// Driving hours saved = avoided trips x minutes per avoided trip / 60.
//   Default 15 minutes per trip.
//
// CO2 avoided (kg) = vehicle miles avoided x 400 g / 1000.
//   Source: U.S. EPA, "Greenhouse Gas Emissions from a Typical Passenger
//   Vehicle" fact sheet: a typical passenger vehicle emits about 400 grams of
//   CO2 per mile. https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle

export const EPA_GRAMS_CO2_PER_VEHICLE_MILE = 400;
export const DEFAULT_MILES_PER_AVOIDED_TRIP = 5;
export const DEFAULT_MINUTES_PER_AVOIDED_TRIP = 15;
export const SMALL_NUMBER_THRESHOLD = 5;
export const FEWER_THAN_LABEL = "fewer than 5";

export function normalizeMilesPerTrip(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MILES_PER_AVOIDED_TRIP;
  return Math.min(50, Math.max(0.5, Math.round(parsed * 100) / 100));
}

export function normalizeMinutesPerTrip(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MINUTES_PER_AVOIDED_TRIP;
  return Math.min(120, Math.max(1, Math.round(parsed)));
}

export function impactEstimates(input: { avoidedTrips: number; milesPerTrip?: unknown; minutesPerTrip?: unknown }) {
  const trips = Math.max(0, Math.floor(Number(input.avoidedTrips) || 0));
  const milesPerTrip = normalizeMilesPerTrip(input.milesPerTrip ?? DEFAULT_MILES_PER_AVOIDED_TRIP);
  const minutesPerTrip = normalizeMinutesPerTrip(input.minutesPerTrip ?? DEFAULT_MINUTES_PER_AVOIDED_TRIP);
  const vehicleMilesAvoided = Math.round(trips * milesPerTrip * 10) / 10;
  const drivingHoursSaved = Math.round(((trips * minutesPerTrip) / 60) * 10) / 10;
  const co2KgAvoided = Math.round(((vehicleMilesAvoided * EPA_GRAMS_CO2_PER_VEHICLE_MILE) / 1000) * 10) / 10;
  return { avoidedTrips: trips, milesPerTrip, minutesPerTrip, vehicleMilesAvoided, drivingHoursSaved, co2KgAvoided };
}

/** Counts of 1 to 4 are shown as "fewer than 5". Zero is shown as 0. */
export function isSuppressed(count: number) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 0 && n < SMALL_NUMBER_THRESHOLD;
}

export function displayCount(count: number) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return isSuppressed(n) ? FEWER_THAN_LABEL : n.toLocaleString("en-US");
}

/** Derived values (miles, hours, CO2) are hidden when their base count is small. */
export function displayDerived(value: number, baseCount: number, unit: string) {
  if (isSuppressed(baseCount)) return "not shown for small numbers";
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return `${rounded.toLocaleString("en-US")} ${unit}`.trim();
}

export type ImpactCounts = {
  completedRides: number;
  ridersServed: number;
  seatsShared: number;
  avoidedTrips: number;
  activeDrivers: number;
  familiesParticipating: number;
};

export type ImpactPeriodKey = "month" | "school_year" | "all_time";

/** Applies small-number suppression to every count and derived estimate. */
export function publicImpactRow(counts: ImpactCounts, options: { milesPerTrip?: unknown; minutesPerTrip?: unknown } = {}) {
  const est = impactEstimates({ avoidedTrips: counts.avoidedTrips, ...options });
  return {
    completedRides: displayCount(counts.completedRides),
    ridersServed: displayCount(counts.ridersServed),
    seatsShared: displayCount(counts.seatsShared),
    avoidedTrips: displayCount(counts.avoidedTrips),
    vehicleMilesAvoided: displayDerived(est.vehicleMilesAvoided, counts.avoidedTrips, "miles"),
    drivingHoursSaved: displayDerived(est.drivingHoursSaved, counts.avoidedTrips, "hours"),
    co2KgAvoided: displayDerived(est.co2KgAvoided, counts.avoidedTrips, "kg CO2"),
    activeDrivers: displayCount(counts.activeDrivers),
    familiesParticipating: displayCount(counts.familiesParticipating),
  };
}

/** US school year: August 1 through July 31, UTC. */
export function schoolYearStart(now: Date = new Date()) {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 7, 1));
}

export function impactPeriods(now: Date = new Date()) {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const schoolYear = schoolYearStart(now);
  const label = `${schoolYear.getUTCFullYear()}-${String((schoolYear.getUTCFullYear() + 1) % 100).padStart(2, "0")}`;
  return [
    { key: "month" as const, label: "This month", start: month },
    { key: "school_year" as const, label: `School year ${label}`, start: schoolYear },
    { key: "all_time" as const, label: "All time", start: null as Date | null },
  ];
}

function csvCell(value: string) {
  const text = String(value ?? "");
  // Neutralize spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function impactCsv(input: {
  organizationName: string;
  generatedAt: string;
  rows: Array<{ label: string; display: ReturnType<typeof publicImpactRow> }>;
  milesPerTrip: number;
  minutesPerTrip: number;
}) {
  const header = ["Period", "Completed rides", "Riders served", "Seats shared", "Vehicle trips avoided", "Vehicle miles avoided", "Driving hours saved", "CO2 avoided", "Active drivers", "Families participating"];
  const lines = [
    [`BandWagon impact report: ${input.organizationName}`],
    [`Generated ${input.generatedAt}. Counts under 5 are shown as "fewer than 5" to protect privacy.`],
    [`Estimates use ${input.milesPerTrip} miles and ${input.minutesPerTrip} minutes per avoided trip and 400 g CO2 per vehicle mile (U.S. EPA).`],
    [],
    header,
    ...input.rows.map((row) => [row.label, row.display.completedRides, row.display.ridersServed, row.display.seatsShared, row.display.avoidedTrips, row.display.vehicleMilesAvoided, row.display.drivingHoursSaved, row.display.co2KgAvoided, row.display.activeDrivers, row.display.familiesParticipating]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
