import { NextResponse } from "next/server";
import { requestOtp, verifyOtp } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

function requestIp(request: Request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim() || null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "request") {
      const result = await requestOtp({
        identifier: String(body.identifier || ""),
        displayName: body.displayName || null,
        householdName: body.householdName || null,
        birthMonth: body.birthMonth == null || body.birthMonth === "" ? null : Number(body.birthMonth),
        birthYear: body.birthYear == null || body.birthYear === "" ? null : Number(body.birthYear),
        signupIntent: body.signupIntent === true,
        requestIp: requestIp(request),
      });
      return NextResponse.json(result, privateResponse);
    }
    if (body.action === "verify") {
      const result = await verifyOtp({
        challengeId: String(body.challengeId || ""),
        code: String(body.code || ""),
        requestIp: requestIp(request),
        userAgent: request.headers.get("user-agent"),
      });
      const response = NextResponse.json({
        ok: true,
        personId: result.personId,
        createdAccount: result.createdAccount,
      });
      response.cookies.set(SESSION_COOKIE, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        priority: "high",
        path: "/",
        expires: new Date(result.expiresAt),
      });
      response.headers.set("cache-control", "no-store, private");
      return response;
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, ...privateResponse });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication failed" },
      { status: 400, ...privateResponse }
    );
  }
}
