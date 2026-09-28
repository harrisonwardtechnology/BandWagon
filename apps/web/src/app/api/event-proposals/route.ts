import { NextResponse } from "next/server";
import { getSessionIdentity } from "@/lib/auth";
import {
  memberEventProposalContext,
  resubmitEventProposal,
  submitEventProposal,
  withdrawEventProposal,
} from "@/lib/event-proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

export async function GET() {
  const identity = await getSessionIdentity();
  if (!identity) return NextResponse.json({ error: "Please sign in" }, { status: 401, ...privateResponse });
  try {
    return NextResponse.json({ ok: true, ...(await memberEventProposalContext(identity)) }, privateResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load event proposals" }, { status: 400, ...privateResponse });
  }
}

export async function POST(request: Request) {
  const identity = await getSessionIdentity();
  if (!identity) return NextResponse.json({ error: "Please sign in" }, { status: 401, ...privateResponse });
  const body = await request.json().catch(() => ({}));
  const fields = {
    title: body.title,
    description: body.description,
    locationName: body.locationName,
    locationAddress: body.locationAddress,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    allDay: body.allDay === true,
    expectedRiders: body.expectedRiders,
    notes: body.notes,
  };
  try {
    if (body.action === "submit") {
      const proposal = await submitEventProposal(identity, String(body.organizationId || ""), fields);
      return NextResponse.json({ ok: true, proposal, ...(await memberEventProposalContext(identity)) }, privateResponse);
    }
    if (body.action === "resubmit") {
      const proposal = await resubmitEventProposal(identity, String(body.proposalId || ""), fields);
      return NextResponse.json({ ok: true, proposal, ...(await memberEventProposalContext(identity)) }, privateResponse);
    }
    if (body.action === "withdraw") {
      const proposal = await withdrawEventProposal(identity, String(body.proposalId || ""));
      return NextResponse.json({ ok: true, proposal, ...(await memberEventProposalContext(identity)) }, privateResponse);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, ...privateResponse });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the proposal" }, { status: 400, ...privateResponse });
  }
}
