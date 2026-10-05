import { getDb } from "@/lib/db";
import { deliveredMobileChannel } from "@/lib/messaging-policy";
import type { TwilioForm } from "@/lib/twilio-form";

/**
 * Record the channel Twilio really used for a text. The send path can only log
 * the channel it asked for ("rcs" for auto sends), so an SMS fallback would
 * otherwise stay logged as RCS. Safe to run more than once for the same
 * callback. The first requested channel is kept in metadata.requestedChannel.
 */
export const DELIVERED_STATUSES = new Set(["delivered", "read"]);

export async function recordDeliveredChannelFromStatus(form: TwilioForm) {
  const sid = form.MessageSid || form.SmsSid;
  // Only a delivery tells us the channel that really reached the phone. Twilio
  // does not promise callback order, so a late "sent" or "failed" from the RCS
  // attempt must not overwrite the SMS fallback that was delivered.
  const status = String(form.MessageStatus || form.SmsStatus || "").toLowerCase();
  if (!DELIVERED_STATUSES.has(status)) return { updated: 0, channel: null };
  const channel = deliveredMobileChannel({ from: form.From, channelPrefix: form.ChannelPrefix });
  if (!sid || !channel) return { updated: 0, channel };
  const db = getDb();
  if (!db) return { updated: 0, channel };
  // created_at keeps this on the (channel, created_at) index; callbacks arrive within minutes.
  const result = await db.query(
    `update notification_deliveries
        set metadata=metadata||jsonb_build_object(
              'requestedChannel',coalesce(metadata->>'requestedChannel',channel),
              'deliveredChannel',$2::text),
            channel=$2::text
      where provider_message_id=$1 and channel in ('sms','rcs')
        and created_at>now()-interval '7 days'
        and (channel<>$2::text or metadata->>'deliveredChannel' is distinct from $2::text)`,
    [sid, channel]
  );
  return { updated: result.rowCount || 0, channel };
}
