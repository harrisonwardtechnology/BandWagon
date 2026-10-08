import { upkeepResponse } from "@/lib/upkeep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bills and Renewals check for Uptime Kuma: 200 when all is well, 503 when a domain is about to lapse or GitHub
// stopped building (usually billing). Needs "Authorization: Bearer <UPKEEP_TOKEN>"; without it, a plain 404.
// See docs/operations/UPTIME-KUMA-PLAYBOOK.md#bills-and-renewals-check.
export async function GET(request: Request) {
  return upkeepResponse(request.headers.get("authorization"));
}
