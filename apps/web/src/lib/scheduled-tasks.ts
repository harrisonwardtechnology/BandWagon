import { runCronWithHeartbeat } from "@/lib/cron-health";
import { deadLetterExpiredJobs, pruneFinishedJobs } from "@/lib/jobs";

// Every recurring job in one place. Workers enqueue one job per task per
// interval (deduped), so this replaces the outside timers that used to POST
// to /api/cron/*. The HTTP endpoints still work and share the same lock.
//
// Each run() lazy-imports its module so a web-only process never loads them.
export type ScheduledTask = {
  key: string;
  everyMinutes: number;
  expectedMaxAgeMinutes: number;
  run: () => Promise<unknown>;
};

export const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    key: "ride-reminders", everyMinutes: 15, expectedMaxAgeMinutes: 45,
    run: async () => (await import("@/lib/ride-reminders")).dispatchRideReminders(),
  },
  {
    key: "status-monitoring", everyMinutes: 10, expectedMaxAgeMinutes: 30,
    run: async () => (await import("@/lib/status-monitoring")).syncStatusMonitoring(75),
  },
  {
    key: "organization-decommission", everyMinutes: 30, expectedMaxAgeMinutes: 180,
    run: async () => (await import("@/lib/organization-decommission-worker")).processOrganizationDecommissions(10),
  },
  {
    key: "privacy-maintenance", everyMinutes: 60, expectedMaxAgeMinutes: 180,
    run: async () => (await import("@/lib/privacy-maintenance")).processPrivacyMaintenance(),
  },
  {
    key: "google-calendar-sync", everyMinutes: 60, expectedMaxAgeMinutes: 180,
    run: async () => {
      if (!process.env.GOOGLE_CLIENT_ID) return { skipped: true, reason: "Google Calendar is not configured" };
      const [{ syncSelectedGoogleCalendars, getActiveGoogleConnection }, { normalizeImportedCalendarEvents }] = await Promise.all([import("@/lib/google"), import("@/lib/events")]);
      // Nothing connected (or the last connection needs reconnecting): nothing to sync, not a failure.
      if (!(await getActiveGoogleConnection())) return { skipped: true, reason: "No active Google Calendar connection" };
      const sync = await syncSelectedGoogleCalendars();
      return { ...sync, normalized: await normalizeImportedCalendarEvents() };
    },
  },
  {
    key: "microsoft-calendar-sync", everyMinutes: 60, expectedMaxAgeMinutes: 180,
    run: async () => {
      const [{ syncAllMicrosoftCalendars }, { normalizeImportedCalendarEvents }] = await Promise.all([import("@/lib/microsoft"), import("@/lib/events")]);
      const sync = await syncAllMicrosoftCalendars();
      return { ...sync, normalized: await normalizeImportedCalendarEvents() };
    },
  },
  {
    key: "platform-budget", everyMinutes: 360, expectedMaxAgeMinutes: 2160,
    run: async () => (await import("@/lib/platform-budget")).evaluatePlatformBudget(),
  },
  {
    key: "safety-maintenance", everyMinutes: 720, expectedMaxAgeMinutes: 2160,
    run: async () => (await import("@/lib/credential-expiration")).processCredentialExpirations(),
  },
  {
    key: "job-queue-maintenance", everyMinutes: 60, expectedMaxAgeMinutes: 180,
    run: async () => ({ ...(await deadLetterExpiredJobs()), ...(await pruneFinishedJobs()) }),
  },
];

export function scheduledJobKind(key: string) {
  return `scheduled:${key}`;
}

export async function runScheduledTask(key: string) {
  const task = SCHEDULED_TASKS.find((item) => item.key === key);
  if (!task) throw new Error(`Unknown scheduled task ${key}`);
  return runCronWithHeartbeat({ key: task.key, expectedMaxAgeMinutes: task.expectedMaxAgeMinutes, run: task.run });
}
