// Pure rules for self-serve organization onboarding. No imports so node --test
// can load this file directly.

export const ORGANIZATION_AGREEMENT_VERSION = "2026-09-26-draft";
export const ORGANIZATION_AGREEMENT_PATH = "/legal/organization-agreement";
export const MAX_OPEN_ORGANIZATION_REQUESTS = 3;

export const ORGANIZATION_TYPES = {
  school_band: "School band",
  school_club: "School club or team",
  youth_sports: "Youth sports",
  faith_community: "Faith community",
  scouting: "Scouting",
  other: "Other",
} as const;
export type OrganizationType = keyof typeof ORGANIZATION_TYPES;

// ---- Tenant slugs (shared with saas-tenants.ts) ----

export const TENANT_SLUG_MIN = 2;
export const TENANT_SLUG_MAX = 50;

const RESERVED_TENANT_SLUGS = new Set([
  "www", "admin", "api", "app", "support", "status", "mail", "smtp", "mta-sts", "autodiscover", "calendar", "help", "docs",
  "bandwagon", "auth", "login", "security", "legal", "billing", "static", "cdn", "assets", "dev", "staging", "test", "demo",
]);

export function normalizeSlug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function isReservedTenantSlug(slug: string) {
  return RESERVED_TENANT_SLUGS.has(normalizeSlug(slug));
}

/** Returns a plain-English problem with the slug, or null when the format is fine. */
export function tenantSlugError(value: string) {
  const slug = normalizeSlug(value);
  if (!slug) return "Choose a web address";
  if (slug.length < TENANT_SLUG_MIN || slug.length > TENANT_SLUG_MAX) return `Use ${TENANT_SLUG_MIN} to ${TENANT_SLUG_MAX} letters, numbers, or hyphens`;
  if (isReservedTenantSlug(slug)) return "That web address is reserved";
  return null;
}

// ---- Request validation ----

export type OrganizationRequestInput = {
  organizationName: string;
  slug: string;
  organizationType: OrganizationType;
  city: string;
  state: string;
  approximateFamilies: number;
  requesterRole: string;
  sponsoringOrganization: string | null;
  website: string | null;
  rideDescription: string;
  agreementAccepted: true;
};

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeWebsite(value: unknown) {
  const raw = clean(value, 300);
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function validateOrganizationRequest(body: Record<string, unknown>):
  | { ok: true; value: OrganizationRequestInput }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const organizationName = clean(body.organizationName, 120);
  const slug = normalizeSlug(String(body.slug ?? ""));
  const organizationType = clean(body.organizationType, 40);
  const city = clean(body.city, 80);
  const state = clean(body.state, 40);
  const families = Number(body.approximateFamilies);
  const requesterRole = clean(body.requesterRole, 120);
  const sponsoringOrganization = clean(body.sponsoringOrganization, 160) || null;
  const website = normalizeWebsite(body.website);
  const rideDescription = String(body.rideDescription ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 2000);

  if (organizationName.length < 2) errors.organizationName = "Enter the organization name";
  const slugError = tenantSlugError(slug);
  if (slugError) errors.slug = slugError;
  if (!(organizationType in ORGANIZATION_TYPES)) errors.organizationType = "Choose an organization type";
  if (city.length < 2) errors.city = "Enter a city";
  if (state.length < 2) errors.state = "Enter a state";
  if (!Number.isInteger(families) || families < 1 || families > 100000) errors.approximateFamilies = "Enter about how many families will take part";
  if (requesterRole.length < 2) errors.requesterRole = "Tell us your role";
  if (website === undefined) errors.website = "Enter a valid website or leave it blank";
  if (rideDescription.length < 20) errors.rideDescription = "Tell us a little more about how rides would work";
  if (body.agreementAccepted !== true) errors.agreementAccepted = "Accept the Organization Agreement to continue";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      organizationName,
      slug,
      organizationType: organizationType as OrganizationType,
      city,
      state,
      approximateFamilies: families,
      requesterRole,
      sponsoringOrganization,
      website: website ?? null,
      rideDescription,
      agreementAccepted: true,
    },
  };
}

export function openRequestLimitReached(openCount: number) {
  return openCount >= MAX_OPEN_ORGANIZATION_REQUESTS;
}

export function canWithdrawRequest(status: string) {
  return status === "pending";
}

// ---- Platform review ----

// Drawn from docs/ORGANIZATION-REVIEW-GUIDE.md.
export const ORGANIZATION_REVIEW_CHECKLIST = [
  { key: "real_organization", label: "The organization looks real (website, school, or sponsor checks out)" },
  { key: "requester_authority", label: "The requester seems able to act for the organization" },
  { key: "voluntary_carpool", label: "Use fits voluntary, parent-led carpools, not school or paid transportation" },
  { key: "driver_rules_owner", label: "The organization understands it sets any driver requirements" },
  { key: "local_review", label: "Any school or program review they need is noted" },
  { key: "name_and_address", label: "Name and web address are appropriate and not misleading" },
] as const;
export type ReviewChecklistKey = (typeof ORGANIZATION_REVIEW_CHECKLIST)[number]["key"];

export function normalizeReviewChecklist(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result: Record<string, boolean> = {};
  for (const item of ORGANIZATION_REVIEW_CHECKLIST) result[item.key] = source[item.key] === true;
  return result;
}

export function reviewDecisionError(input: { decision: string; status: string; note: string | null | undefined; checklist: Record<string, boolean> }) {
  if (input.status !== "pending") return "This request has already been decided";
  if (input.decision === "reject") {
    if (!String(input.note || "").trim()) return "Add a note explaining why the request was not approved";
    return null;
  }
  if (input.decision === "approve") {
    const missing = ORGANIZATION_REVIEW_CHECKLIST.filter(item => input.checklist[item.key] !== true);
    if (missing.length) return "Complete every review checklist item before approving";
    return null;
  }
  return "Unknown decision";
}

// ---- New organization setup checklist ----

export const SETUP_CHECKLIST = [
  { key: "branding", label: "Set Your Branding", description: "Name, logo, colors, and welcome text.", href: "/admin/branding", manual: false },
  { key: "join_code", label: "Create And Share A Join Code", description: "Families use it to join your community.", href: "/admin/setup#join-code", manual: false },
  { key: "driver_requirements", label: "Set Driver Requirements", description: "Minimum age, license, insurance, and approval rules.", href: "/admin/driver-requirements", manual: true },
  { key: "policies", label: "Accept Organization Policies", description: "An owner accepts the current terms for the group.", href: "/admin/organization-policies", manual: false },
  { key: "events", label: "Add An Event Or Connect A Calendar", description: "Rides are organized around events.", href: "/admin/events", manual: false },
  { key: "co_admin", label: "Invite A Co-Admin", description: "A second admin keeps things running if you are away.", href: "/admin/setup#invite", manual: false },
  { key: "notifications", label: "Review Notification And Text Settings", description: "Check how members get ride updates.", href: "/admin/notifications", manual: true },
  { key: "test_ride", label: "Run A Test Ride", description: "Try one ride before inviting everyone.", href: "/app/rides", manual: false },
] as const;
export type SetupItemKey = (typeof SETUP_CHECKLIST)[number]["key"];

export function isManualSetupItem(key: string) {
  return SETUP_CHECKLIST.some(item => item.key === key && item.manual);
}

export function computeSetupProgress(autoDone: Partial<Record<string, boolean>>, manualDone: string[]) {
  const manual = new Set(manualDone);
  const items = SETUP_CHECKLIST.map(item => {
    const auto = autoDone[item.key] === true;
    const byHand = !auto && item.manual && manual.has(item.key);
    return { ...item, done: auto || byHand, source: auto ? "automatic" : byHand ? "manual" : null } as const;
  });
  const completed = items.filter(item => item.done).length;
  const total = items.length;
  return { items, completed, total, percent: total ? Math.round((completed / total) * 100) : 0, allDone: completed === total };
}
