import { requireAdminTestToken } from "@/lib/admin-test";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const denied = requireAdminTestToken(request); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) return Response.json({ error: "Address is required" }, { status: 400 });
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) return Response.json({ error: "GOOGLE_MAPS_SERVER_API_KEY is not configured" }, { status: 503 });
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json"); url.searchParams.set("address", address); url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" }); const result = await response.json();
  if (!response.ok || result.status !== "OK") return Response.json({ error: result.error_message || `Google Geocoding returned ${result.status}` }, { status: 502 });
  const first = result.results?.[0];
  return Response.json({ ok: true, formattedAddress: first?.formatted_address, placeId: first?.place_id, location: first?.geometry?.location, viewport: first?.geometry?.viewport });
}
