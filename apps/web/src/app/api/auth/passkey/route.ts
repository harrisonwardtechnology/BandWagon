import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { PASSKEY_CHALLENGE_TTL_SECONDS, PASSKEY_FLOW_COOKIE } from "@/lib/passkey-policy";
import { PasskeyError, finishPasskeySignIn, passkeyAvailability, startPasskeySignIn } from "@/lib/passkeys";

// Passkey sign-in. The challenge is bound to a short-lived, httpOnly flow
// cookie so it can only be finished by the browser that started it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };
const FLOW_COOKIE_PATH = "/api/auth/passkey";

function flowCookie(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${PASSKEY_FLOW_COOKIE}=`));
  return raw ? decodeURIComponent(raw.slice(PASSKEY_FLOW_COOKIE.length + 1)) : null;
}

function errorResponse(error: unknown) {
  if (error instanceof PasskeyError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: privateHeaders });
  }
  console.error("Passkey sign-in failed", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Passkey sign-in is temporarily unavailable" }, { status: 500, headers: privateHeaders });
}

export async function GET(request: Request) {
  const availability = await passkeyAvailability(request).catch(() => ({ enabled: false as const }));
  return NextResponse.json(availability, { headers: privateHeaders });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "options") {
      const { options, flowId } = await startPasskeySignIn(request);
      const response = NextResponse.json({ ok: true, options }, { headers: privateHeaders });
      response.cookies.set(PASSKEY_FLOW_COOKIE, flowId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: FLOW_COOKIE_PATH,
        maxAge: PASSKEY_CHALLENGE_TTL_SECONDS,
      });
      return response;
    }
    if (body.action === "verify") {
      const result = await finishPasskeySignIn(request, {
        flowId: flowCookie(request),
        response: body.response,
        userAgent: request.headers.get("user-agent"),
      });
      const response = NextResponse.json({ ok: true, personId: result.personId }, { headers: privateHeaders });
      response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
      response.cookies.set(PASSKEY_FLOW_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: FLOW_COOKIE_PATH, expires: new Date(0) });
      return response;
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
