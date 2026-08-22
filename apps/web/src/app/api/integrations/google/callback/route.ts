import { exchangeGoogleCode, saveGoogleConnection, verifyGoogleState } from "@/lib/google";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL || url.origin;
  const error = url.searchParams.get("error");
  if (error) return Response.redirect(new URL(`/admin/integrations/google?error=${encodeURIComponent(error)}`, base));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyGoogleState(state)) return new Response("Invalid or expired Google OAuth callback", { status: 400 });
  try {
    await saveGoogleConnection(await exchangeGoogleCode(code));
    return Response.redirect(new URL("/admin/integrations/google?connected=1", base));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google OAuth failed";
    return Response.redirect(new URL(`/admin/integrations/google?error=${encodeURIComponent(message)}`, base));
  }
}
