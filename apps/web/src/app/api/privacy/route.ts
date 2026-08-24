import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import {
  cancelAccountDeletion,
  privacyStatus,
  requestAccountDeletion,
} from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

export async function GET() {
  try {
    const identity = await requireSessionIdentity();
    return NextResponse.json({ ok: true, ...(await privacyStatus(identity)) }, privateResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication required" },
      { status: 401, ...privateResponse }
    );
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(() => ({}));
    if (body.action === "request_deletion") {
      return NextResponse.json({
        ok: true,
        result: await requestAccountDeletion(identity, String(body.confirmation || "")),
      }, privateResponse);
    }
    if (body.action === "cancel_deletion") {
      return NextResponse.json({
        ok: true,
        result: await cancelAccountDeletion(identity, String(body.requestId || "")),
      }, privateResponse);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, ...privateResponse });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Privacy request failed" },
      { status: 400, ...privateResponse }
    );
  }
}
