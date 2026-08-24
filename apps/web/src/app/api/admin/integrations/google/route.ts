import { requirePlatformRole } from "@/lib/auth";
import { googleAuthorizationUrl, googleIntegrationStatus } from "@/lib/google";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { await requirePlatformRole(["owner","support"]); return Response.json(await googleIntegrationStatus()); } catch (error) { return Response.json({error:error instanceof Error?error.message:"Platform administrator access is required"},{status:403}); } }
export async function POST() { try { await requirePlatformRole(["owner"]); return Response.json({ authorizationUrl: googleAuthorizationUrl() }); } catch (error) { return Response.json({error:error instanceof Error?error.message:"Platform owner access is required"},{status:403}); } }
