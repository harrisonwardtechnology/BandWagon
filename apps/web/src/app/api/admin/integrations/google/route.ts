import { requireAdminTestToken } from "@/lib/admin-test";
import { googleAuthorizationUrl, googleIntegrationStatus } from "@/lib/google";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const denied = requireAdminTestToken(request); if (denied) return denied; return Response.json(await googleIntegrationStatus()); }
export async function POST(request: Request) { const denied = requireAdminTestToken(request); if (denied) return denied; return Response.json({ authorizationUrl: googleAuthorizationUrl() }); }
