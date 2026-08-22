import crypto from "node:crypto";

export function validateAdminTestToken(request: Request) {
  const configured = process.env.ADMIN_TEST_TOKEN;
  if (!configured) return false;
  const supplied = request.headers.get("x-bandwagon-admin-token") || "";
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAdminTestToken(request: Request) {
  if (!process.env.ADMIN_TEST_TOKEN) {
    return new Response("ADMIN_TEST_TOKEN is not configured", { status: 503 });
  }
  if (!validateAdminTestToken(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
