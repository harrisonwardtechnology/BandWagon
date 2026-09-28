import { enqueueJob } from "@/lib/jobs";

export const WAITLIST_PROCESS_JOB_KIND = "waitlist.process_ride";
export const WAITLIST_EXPIRE_JOB_KIND = "waitlist.offer_expire";

/**
 * Ask a worker to look at a ride's waitlist because a seat may have opened
 * (cancellation, removed passenger, more seats, new carpool, ride closed).
 * Processing is idempotent under a row lock on the ride, so extra jobs are
 * harmless. The ride-waitlists scheduled sweep is the safety net if this
 * enqueue fails.
 */
export async function requestWaitlistProcessing(rideId: string, reason: string) {
  if (!rideId) return null;
  return enqueueJob({ kind: WAITLIST_PROCESS_JOB_KIND, payload: { rideId, reason }, maxAttempts: 3 }).catch(() => null);
}
