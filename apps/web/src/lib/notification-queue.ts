import crypto from "node:crypto";
import { enqueueJob } from "@/lib/jobs";
import { parseNotificationDelivery } from "@/lib/job-policy";
import { routeNotification, type NotificationRequest } from "@/lib/notification-router";

export const NOTIFICATION_JOB_KIND = "notification.deliver";

/**
 * Send a notification without making the user's request wait on push,
 * Twilio, or email. With NOTIFICATION_DELIVERY=queue it is written to the
 * job queue and a worker sends it (with retries if the send path throws).
 * Otherwise it is sent inline like before.
 *
 * Use routeNotification directly only when the caller needs the delivery
 * result right away (admin tests, decommission confirmation codes).
 */
export async function queueNotification(request: NotificationRequest) {
  if (parseNotificationDelivery(process.env.NOTIFICATION_DELIVERY) === "inline") {
    return routeNotification(request);
  }
  const correlationId = request.correlationId || crypto.randomUUID();
  const jobId = await enqueueJob({
    kind: NOTIFICATION_JOB_KIND,
    payload: { ...request, correlationId },
    dedupeKey: `notification:${correlationId}`,
    maxAttempts: 4,
  });
  return { queued: true as const, jobId, correlationId, notificationType: request.notificationType };
}
