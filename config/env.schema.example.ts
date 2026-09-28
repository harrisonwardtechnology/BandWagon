import { z } from "zod";

const bool = z.enum(["true", "false"]).transform(v => v === "true");
const int = z.coerce.number().int();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("BandWagon"),
  APP_URL: z.string().url(),
  DEFAULT_TIMEZONE: z.string().min(1).default("America/Chicago"),

  PLATFORM_NAME: z.string().min(1).default("BandWagon"),
  PLATFORM_URL: z.string().url().default("https://bandwagon.club"),
  PLATFORM_VENDOR_NAME: z.string().min(1).default("Harrison Ward Technology"),
  PLATFORM_VENDOR_URL: z.string().url().default("https://harrisonward.com"),
  // Comma list of product (non-tenant) hostnames; first is primary.
  PLATFORM_HOSTNAMES: z.string().default("bandwagon.club,www.bandwagon.club"),
  // Parent domain for default tenant hostnames: <slug>.<TENANT_BASE_DOMAIN>.
  TENANT_BASE_DOMAIN: z.string().default("bandwagon.club"),
  LEGACY_PLATFORM_HOSTNAMES: z.string().default("bandwagon.harrisonward.net,www.bandwagon.harrisonward.net"), // page visits redirect to the platform host
  LEGACY_TENANT_BASE_DOMAINS: z.string().default("harrisonward.org"), // <slug>.harrisonward.org redirects to <slug>.bandwagon.club
  // Public links (build time). Blank hides the link and falls back to email.
  NEXT_PUBLIC_HELP_DESK_URL: z.string().url().optional().or(z.literal("")), // e.g. https://help.bandwagon.club
  NEXT_PUBLIC_STATUS_PAGE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_ENVIRONMENT: z.enum(["production", "staging", "development"]).default("production"),
  // Error tracking. GlitchTip is Sentry-compatible; paste the project's DSN.
  GLITCHTIP_DSN: z.string().optional(), // e.g. https://<key>@glitchtip.bandwagon.club/1
  GLITCHTIP_ENVIRONMENT: z.string().optional(), // defaults to NEXT_PUBLIC_ENVIRONMENT or NODE_ENV
  GLITCHTIP_RELEASE: z.string().optional(), // defaults to Coolify's SOURCE_COMMIT
  GLITCHTIP_MAX_EVENTS_PER_MINUTE: z.coerce.number().int().positive().default(60), // per process
  // Staging safety. Staging forces the sandbox on even if this is false.
  MESSAGING_SANDBOX: bool.default(false),
  SANDBOX_ALLOWED_PHONES: z.string().optional(), // comma list of E.164 numbers
  SANDBOX_ALLOWED_EMAILS: z.string().optional(), // comma list of addresses
  ALLOW_CUSTOM_DOMAINS: bool.default(true),
  DEFAULT_ORG_URL_MODE: z.enum(["path", "subdomain"]).default("path"),

  CUSTOM_DOMAIN_AUTOMATION: z.enum(["manual", "coolify-api"]).default("manual"),
  DOMAIN_VERIFICATION_TTL_HOURS: int.min(1).max(168).default(72),
  DOMAIN_PENDING_RECHECK_MINUTES: int.min(5).default(15),
  DOMAIN_ACTIVE_HEALTHCHECK_HOURS: int.min(1).default(24),
  COOLIFY_API_URL: z.string().url().optional(),
  COOLIFY_API_TOKEN: z.string().optional(),
  COOLIFY_APPLICATION_UUID: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: int.min(1).max(65535).default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().min(1),
  SMTP_FROM_EMAIL: z.string().email(),
  SUPPORT_EMAIL: z.string().email(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  PRIVACY_EMAIL: z.string().email(),
  SECURITY_EMAIL: z.string().email(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  TWILIO_RCS_SENDER: z.string().optional(),
  TWILIO_SMS_FALLBACK_ENABLED: bool.default(true),

  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),

  AUTH_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(32),
  EMAIL_OTP_TTL_MINUTES: int.min(1).max(30).default(10),
  PHONE_OTP_TTL_MINUTES: int.min(1).max(30).default(10),
  SESSION_TTL_DAYS: int.min(1).max(90).default(30),

  CALENDAR_SYNC_INTERVAL_MINUTES: int.min(5).default(15),
  CALENDAR_FULL_RECONCILE_HOURS: int.min(1).default(6),
  CALENDAR_LOOKAHEAD_DAYS: int.min(1).default(180),
  CALENDAR_LOOKBACK_DAYS: int.min(0).default(30),

  ALLOW_INSECURE_DEV_DEFAULTS: bool.default(false),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv): AppEnv {
  const env = envSchema.parse(input);
  if (env.NODE_ENV === "production" && !env.ALLOW_INSECURE_DEV_DEFAULTS) {
    const forbidden = ["changeme", "password", "secret", "test"];
    for (const [name, value] of Object.entries({AUTH_SECRET: env.AUTH_SECRET, DATA_ENCRYPTION_KEY: env.DATA_ENCRYPTION_KEY})) {
      if (forbidden.some(x => String(value).toLowerCase().includes(x))) {
        throw new Error(`${name} appears to use an insecure default`);
      }
    }
    if (!env.APP_URL.startsWith("https://")) throw new Error("Production APP_URL must use HTTPS");
    if (env.CUSTOM_DOMAIN_AUTOMATION === "coolify-api") {
      if (!env.COOLIFY_API_URL || !env.COOLIFY_API_TOKEN || !env.COOLIFY_APPLICATION_UUID) {
        throw new Error("Coolify API domain automation requires COOLIFY_API_URL, COOLIFY_API_TOKEN and COOLIFY_APPLICATION_UUID");
      }
    }
  }
  return env;
}
