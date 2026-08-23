export async function geocodeAddress(addressValue: string) {
  const address = addressValue.trim();
  if (!address) throw new Error("Address is required");
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) throw new Error("Google Maps server geocoding is not configured");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address",address);
  url.searchParams.set("key",key);
  const response = await fetch(url,{cache:"no-store"});
  const result = await response.json().catch(()=>({}));
  if (!response.ok || result.status !== "OK" || !result.results?.[0]) {
    throw new Error(result.error_message || `Google Geocoding returned ${result.status || response.status}`);
  }
  const first = result.results[0];
  const formattedAddress = String(first.formatted_address || address);
  const parts = formattedAddress.split(",").map((part:string)=>part.trim()).filter(Boolean);
  let generalizedArea: string | null = null;
  if (parts.length >= 3) {
    const locality = parts[parts.length-3];
    const region = parts[parts.length-2].replace(/\s+\d{5}(?:-\d{4})?$/," ").trim();
    generalizedArea = [locality,region].filter(Boolean).join(", ");
  }
  return {
    formattedAddress,
    latitude:Number(first.geometry.location.lat),
    longitude:Number(first.geometry.location.lng),
    generalizedArea,
    placeId:first.place_id || null,
  };
}
