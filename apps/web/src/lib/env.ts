import { z } from "zod";

const boolish = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("BandWagon"),
  APP_TAGLINE: z.string().default("Community-powered rides."),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PLATFORM_VENDOR_NAME: z.string().default("Harrison Ward Technology"),
  PLATFORM_VENDOR_URL: z.string().url().default("https://harrisonward.com"),
  DEFAULT_TIMEZONE: z.string().default("America/Chicago"),
  DATABASE_URL: z.string().optional().transform(v => v || undefined),
  DATABASE_SSL: boolish.default("false"),
  REDIS_URL: z.string().optional().transform(v => v || undefined),
  HEALTH_REQUIRE_DATABASE: boolish.default("false"),
  HEALTH_REQUIRE_REDIS: boolish.default("false"),
  AUTH_SECRET: z.string().optional().transform(v => v || undefined),
  DATA_ENCRYPTION_KEY: z.string().optional().transform(v => v || undefined),
  SUPPORT_EMAIL: z.string().email().optional().or(z.literal("")),
  PRIVACY_EMAIL: z.string().email().optional().or(z.literal("")),
  SECURITY_EMAIL: z.string().email().optional().or(z.literal(""))
});

export const env = schema.parse(process.env);

export function assertProductionSafety() {
  if (env.NODE_ENV !== "production") return;
  const bad = new Set(["changeme", "change-me", "test", "secret", "password"]);
  for (const [name, value] of [["AUTH_SECRET", env.AUTH_SECRET], ["DATA_ENCRYPTION_KEY", env.DATA_ENCRYPTION_KEY]] as const) {
    if (value && bad.has(value.toLowerCase())) throw new Error(`${name} contains an insecure placeholder value`);
  }
}
