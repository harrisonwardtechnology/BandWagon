"use client";

import { useEffect, useMemo, useState } from "react";
import { countdownLabel } from "@/lib/ride-waitlist-policy";

type Row = Record<string, any>;
type Act = (body: Row) => Promise<unknown>;

const button = { padding: "9px 13px", border: 0, borderRadius: 9, background: "var(--btn-solid)", color: "var(--on-btn-solid)", fontWeight: 800, cursor: "pointer" } as const;
const secondary = { padding: "7px 10px", border: "1px solid var(--line-strong)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", fontWeight: 700 } as const;
const badge = { display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900, border: "1px solid var(--line-strong)" } as const;
const hidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

function directionLabel(direction: string) {
  return direction === "to_event" ? "To event" : direction === "from_event" ? "From event" : direction === "round_trip" ? "Round trip" : "Other";
}
function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Time not set";
}

/**
 * Offer countdown. The text says how long is left, so it does not rely on
 * color or animation. Screen readers hear a polite update once a minute, not
 * every second.
 */
export function OfferCountdown({ seconds, onExpire }: { seconds: number; onExpire?: () => void }) {
  const [deadline] = useState(() => Date.now() + Math.max(0, seconds) * 1000);
  const [left, setLeft] = useState(Math.max(0, seconds));
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) { clearInterval(timer); onExpire?.(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, onExpire]);
  const minuteAnnouncement = left === 0 ? "Offer expired" : `${Math.ceil(left / 60)} ${Math.ceil(left / 60) === 1 ? "minute" : "minutes"} left to accept`;
  return <span>
    <span role="timer" aria-hidden="true" style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{countdownLabel(left)}</span>
    <span aria-live="polite" style={hidden}>{minuteAnnouncement}</span>
  </span>;
}

function statusText(w: Row) {
  if (w.status === "offered") return "Seat offered";
  if (w.status === "waiting") {
    if (w.guardian_approval_status === "pending" || w.request_status === "pending_approval") return `Number ${w.position} in line. Waiting for guardian approval before a seat can be offered.`;
    return `Number ${w.position} in line`;
  }
  const reasons: Record<string, string> = {
    accepted: "Seat taken", declined: "Offer passed", offer_expired: "Offer expired", left: "Left the waitlist",
    seated_elsewhere: "Seated in another carpool", ride_cancelled: "Carpool cancelled", ride_departed: "Carpool left",
    waitlists_disabled: "Waitlists turned off", left_organization: "No longer a member", request_closed: "Request closed", guardian_denied: "Guardian declined",
  };
  return reasons[w.end_reason] || w.status;
}

export function RiderWaitlists({ waitlists, act, working, reload }: { waitlists: Row[]; act: Act; working: boolean; reload: () => void }) {
  if (!waitlists?.length) return null;
  return <section aria-labelledby="waitlists-heading" style={{ marginBottom: 18 }}>
    <h2 id="waitlists-heading" style={{ marginTop: 0 }}>Your Waitlists</h2>
    {waitlists.map((w) => <div key={w.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><b>{w.passenger_name}</b> · {w.event_title || "Carpool"} · {directionLabel(w.direction)}
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 3 }}>{when(w.departure_at)} · {statusText(w)}{w.status === "waiting" ? ` of ${w.waitlist_count}` : ""}</div>
        </div>
        <span style={{ ...badge, background: w.status === "offered" ? "var(--bg-warn-2)" : "var(--surface)" }}>{w.status === "offered" ? "Action Needed" : w.status === "waiting" ? "On Waitlist" : "Closed"}</span>
      </div>
      {w.status === "offered" && <div role="group" aria-label="Standby offer" style={{ marginTop: 10, padding: 12, border: "2px solid #f59e0b", borderRadius: 12 }}>
        <p style={{ margin: "0 0 8px" }}>A seat opened. It is held for you for a short time. <OfferCountdown seconds={Number(w.seconds_remaining || 0)} onExpire={reload} /></p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={button} disabled={working} onClick={() => act({ action: "accept_standby", entryId: w.id })}>Accept Seat</button>
          <button style={secondary} disabled={working} onClick={() => act({ action: "decline_standby", entryId: w.id })}>Pass</button>
        </div>
      </div>}
      {["waiting", "offered"].includes(w.status) && <button style={{ ...secondary, marginTop: 8 }} disabled={working} onClick={() => { if (window.confirm("Leave this waitlist? You will lose your place in line.")) void act({ action: "leave_waitlist", entryId: w.id }); }}>Leave Waitlist</button>}
    </div>)}
  </section>;
}

export function CarpoolFinder({ carpools, people, waitlists, act, working }: { carpools: Row[]; people: Row[]; waitlists: Row[]; act: Act; working: boolean }) {
  const [rider, setRider] = useState<string>(people?.[0]?.id || "");
  const activeFor = useMemo(() => new Set((waitlists || []).filter((w) => ["waiting", "offered"].includes(w.status) && w.passenger_person_id === rider).map((w) => w.ride_id)), [waitlists, rider]);
  if (!carpools?.length) return null;
  return <section aria-labelledby="carpools-heading" style={{ marginBottom: 18 }}>
    <h2 id="carpools-heading" style={{ marginTop: 0 }}>Upcoming Carpools</h2>
    <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Full carpools take a waitlist. If a seat opens, the first rider in line gets a short time to accept it. Tip: request a ride with your pickup address first, and the waitlist will use that request.</p>
    {people?.length > 1 && <label style={{ display: "block", marginBottom: 10 }}>Rider <select value={rider} onChange={(e) => setRider(e.target.value)} style={{ marginLeft: 6, padding: 6, borderRadius: 8 }}>{people.map((p) => <option key={p.id} value={p.id}>{p.preferred_name || p.display_name}</option>)}</select></label>}
    {carpools.map((c) => {
      const full = Number(c.open_seats) <= 0;
      const onList = activeFor.has(c.id);
      return <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
        <div><b>{c.event_title || "Carpool"}</b> · {directionLabel(c.direction)}
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 3 }}>{when(c.departure_at)}{c.pickup_area ? ` · near ${c.pickup_area}` : ""} · {full ? "Full" : `${c.open_seats} open ${Number(c.open_seats) === 1 ? "seat" : "seats"}`}{Number(c.waitlist_count) > 0 ? ` · ${c.waitlist_count} on waitlist` : ""}</div>
        </div>
        {full && c.waitlists_enabled && (onList
          ? <span style={badge}>On Waitlist</span>
          : <button style={button} disabled={working || !rider} onClick={() => act({ action: "join_waitlist", rideId: c.id, passengerPersonId: rider })}>Join Waitlist</button>)}
        {full && !c.waitlists_enabled && <span style={badge}>Full</span>}
      </div>;
    })}
  </section>;
}

/** Driver's view of their own carpool's waitlist plus a seat control. Same rider details a driver sees on open requests. */
export function DriverWaitlist({ ride, act, working }: { ride: Row; act: Act; working: boolean }) {
  const [seats, setSeats] = useState(String(ride.capacity_snapshot || 1));
  const list: Row[] = ride.waitlist || [];
  if (ride.status !== "confirmed") return null;
  return <div style={{ marginTop: 10, padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <b>Waitlist: {list.length}</b>
      <label style={{ marginLeft: "auto" }}>Seats In Car <input type="number" min={1} max={12} value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 60, padding: 6, borderRadius: 8, border: "1px solid var(--line-strong)" }} /></label>
      <button style={secondary} disabled={working || Number(seats) === Number(ride.capacity_snapshot)} onClick={() => act({ action: "update_ride_seats", rideId: ride.id, seats: Number(seats) })}>Save Seats</button>
    </div>
    {list.length > 0 && <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
      {list.map((w) => <li key={w.id}>{w.passenger_name}{Number(w.seats_needed) > 1 ? ` (${w.seats_needed} seats)` : ""}{w.pickup_area ? ` · near ${w.pickup_area}` : ""}{w.status === "offered" ? " · seat offered, waiting for an answer" : ""}</li>)}
    </ol>}
  </div>;
}
