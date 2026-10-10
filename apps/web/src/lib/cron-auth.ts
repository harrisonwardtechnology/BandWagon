import crypto from "node:crypto";

/**
 * Constant-time bearer check for cron and internal ingest routes.
 * The first configured secret among `envNames` is used, so routes can keep
 * their existing fallback order (for example a dedicated secret, then a shared one).
 */
export function validCronBearer(request: Request, envNames: string[]) {
  const configured = envNames.map((name) => process.env[name] || "").find(Boolean);
  if (!configured) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
