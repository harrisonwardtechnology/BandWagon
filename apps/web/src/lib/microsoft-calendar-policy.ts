const GRAPH_ORIGIN = "https://graph.microsoft.com";

export function isAllowedMicrosoftGraphNextLink(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.origin === GRAPH_ORIGIN && url.pathname.startsWith("/v1.0/");
  } catch {
    return false;
  }
}

export function microsoftDateTime(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const dateTime = String((value as { dateTime?: unknown }).dateTime || "").trim();
  if (!dateTime) return null;
  const hasZone = /(?:z|[+-]\d{2}:\d{2})$/i.test(dateTime);
  const parsed = new Date(hasZone ? dateTime : `${dateTime}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
