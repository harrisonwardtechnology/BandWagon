// Keyed hashes for values that must not be stored or logged in the clear:
// rate-limit buckets (IP, person, email) and cache keys.
// No "@/" imports so node --test can load this file directly.
import crypto from "node:crypto";

export const PRIVATE_HASH_SECRET_ERROR = "AUTH_SECRET or DATA_ENCRYPTION_KEY is required";

type Env = Record<string, string | undefined>;

function configuredSecret(env: Env) {
  for (const name of ["AUTH_SECRET", "DATA_ENCRYPTION_KEY"] as const) {
    const value = env[name];
    // Returned exactly as set, so hashes stay the same as before for a configured deployment.
    if (value && value.trim()) return value;
  }
  return null;
}

export function privateHashConfigured(env: Env = process.env) {
  return configuredSecret(env) !== null;
}

/**
 * The key for private hashes: AUTH_SECRET, or DATA_ENCRYPTION_KEY when that
 * is not set. There is no built-in fallback. A fixed key in the source would
 * make every "private" hash guessable, so this throws instead and the caller
 * fails closed.
 */
export function privateHashSecret(env: Env = process.env) {
  const secret = configuredSecret(env);
  if (!secret) throw new Error(PRIVATE_HASH_SECRET_ERROR);
  return secret;
}

/** HMAC-SHA256 of the value as hex. Throws when no key is configured. */
export function privateHmac(value: string, env: Env = process.env) {
  return crypto.createHmac("sha256", privateHashSecret(env)).update(value).digest("hex");
}
