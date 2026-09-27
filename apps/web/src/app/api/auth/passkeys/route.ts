import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import {
  PasskeyError,
  finishPasskeyRegistration,
  passkeyManagementStatus,
  removePasskey,
  renamePasskey,
  startPasskeyRegistration,
} from "@/lib/passkeys";

// Passkey management for the signed-in user (Settings, Security).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

function errorResponse(error: unknown) {
  if (error instanceof PasskeyError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: privateHeaders });
  }
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json({ error: error.message }, { status: 401, headers: privateHeaders });
  }
  console.error("Passkey management failed", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Passkeys are temporarily unavailable" }, { status: 500, headers: privateHeaders });
}

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    return NextResponse.json({ ok: true, ...(await passkeyManagementStatus(request, identity)) }, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(() => ({}));
    if (body.action === "register_options") {
      return NextResponse.json({ ok: true, options: await startPasskeyRegistration(request, identity) }, { headers: privateHeaders });
    }
    if (body.action === "register_verify") {
      const passkey = await finishPasskeyRegistration(request, identity, { response: body.response, nickname: body.nickname });
      return NextResponse.json({ ok: true, passkey }, { headers: privateHeaders });
    }
    if (body.action === "rename") {
      const passkey = await renamePasskey(identity, String(body.id || ""), body.nickname);
      return NextResponse.json({ ok: true, passkey }, { headers: privateHeaders });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const id = new URL(request.url).searchParams.get("id") || "";
    return NextResponse.json(await removePasskey(request, identity, id), { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
