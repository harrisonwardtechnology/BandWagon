import { NextResponse } from "next/server";
import { getSessionIdentity, SESSION_COOKIE, SUPPORT_COOKIE } from "@/lib/auth";
import { revokeSessionByToken } from "@/lib/auth-service";

export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

export async function GET() {
  const identity = await getSessionIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401, ...privateResponse });
  return NextResponse.json({ authenticated: true, identity }, privateResponse);
}

export async function DELETE(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await revokeSessionByToken(decodeURIComponent(token)).catch(() => {});
  const response = NextResponse.json({ ok: true }, privateResponse);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", priority: "high", path: "/", expires: new Date(0) });
  response.cookies.set(SUPPORT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", priority: "high", path: "/", expires: new Date(0) });
  return response;
}
