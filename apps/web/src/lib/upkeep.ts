// Bills and Renewals check: the things that quietly stop BandWagon when a bill or a renewal slips.
//
//   Domains  each domain's registration end date, from the public RDAP lookup (no account needed).
//            Watches the APP_URL domain plus WATCH_DOMAINS (comma separated, for example flomogo.app).
//   Build    GitHub: did the last build on the deployed branch actually run, or did GitHub refuse to start it
//            (almost always a failed payment or the Actions spending limit)? Needs GITHUB_STATUS_TOKEN, a
//            fine-grained token for this one repo with read-only Actions and Contents. Without it this part says off.
//
// GET /api/health/upkeep returns 503 when anything is red, so Uptime Kuma pages the phone. It is a plain 404 unless
// the request carries "Authorization: Bearer <UPKEEP_TOKEN>". Tokens are never logged or returned.
// See docs/operations/UPTIME-KUMA-PLAYBOOK.md#bills-and-renewals-check.
//
// No "@/" imports here so node --test can load this file directly.

import { timingSafeEqual } from "node:crypto";

export type UpkeepState = "ok" | "warn" | "bad";
export type UpkeepItem = { name: string; state: UpkeepState; detail: string; fix?: string };
export type Getter = (url: string, headers?: Record<string, string>) => Promise<unknown>;

const DAY = 86_400_000;
const CACHE_MS = 6 * 3_600_000;
const BUILD = "Build Pipeline (GitHub)";
export const DEFAULT_GITHUB_REPO = "harrisonwardtechnology/BandWagon";

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": "BandWagon Upkeep Check", ...headers }, signal: AbortSignal.timeout(15_000), redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The registrable domains to watch: the app's own plus WATCH_DOMAINS. Each host is cut to its last two labels,
// which is right for .club, .app, .com and .net.
export function upkeepDomains(appUrl = process.env.APP_URL ?? "", extra = process.env.WATCH_DOMAINS ?? ""): string[] {
  let host = "";
  try { host = new URL(appUrl).hostname; } catch { host = ""; }
  const out: string[] = [];
  for (const raw of [host, ...extra.split(",")]) {
    const n = raw.trim().toLowerCase().replace(/\.$/, "");
    if (!n || n === "localhost" || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(n)) continue;
    const base = n.split(".").slice(-2).join(".");
    if (!out.includes(base)) out.push(base);
  }
  return out;
}

export async function domainItems(now = new Date(), get: Getter = getJson): Promise<UpkeepItem[]> {
  const items: UpkeepItem[] = [];
  for (const d of upkeepDomains()) {
    const name = `Domain: ${d}`;
    try {
      const data = (await get(`https://rdap.org/domain/${d}`, { Accept: "application/rdap+json" })) as { events?: { eventAction?: string; eventDate?: string }[] } | null;
      const ev = (data?.events ?? []).find((e) => e.eventAction === "expiration" && e.eventDate);
      if (!ev) { items.push({ name, state: "warn", detail: "The registry didn't give a renewal date." }); continue; }
      const end = new Date(ev.eventDate!.slice(0, 10) + "T00:00:00Z");
      if (Number.isNaN(end.getTime())) { items.push({ name, state: "warn", detail: "The registry gave a renewal date that couldn't be read." }); continue; }
      const days = Math.floor((end.getTime() - now.getTime()) / DAY);
      const state: UpkeepState = days > 30 ? "ok" : days > 7 ? "warn" : "bad";
      items.push({ name, state, detail: `paid through ${end.toISOString().slice(0, 10)} (${days} days)`,
        fix: state === "ok" ? undefined : "Renew it at your registrar now, and check auto renew and the card on file." });
    } catch (e) {
      items.push({ name, state: "warn", detail: `Couldn't look up the renewal date: ${(e as Error).name}` });
    }
  }
  return items;
}

export async function buildItems(_now = new Date(), get: Getter = getJson): Promise<UpkeepItem[]> {
  const token = process.env.GITHUB_STATUS_TOKEN ?? "";
  const repo = process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) {
    return [{ name: BUILD, state: "warn", detail: "off: no GITHUB_STATUS_TOKEN",
      fix: "Make a fine-grained GitHub token for this repo with read-only Actions and Contents, and set it in Coolify." }];
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(branch)) {
    return [{ name: BUILD, state: "warn", detail: "GITHUB_REPO or GITHUB_BRANCH doesn't look right." }];
  }
  const gh = (path: string) => get(`https://api.github.com${path}`, { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
  try {
    const runs = ((await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`)) as { workflow_runs?: { id: number; status: string; conclusion: string | null }[] } | null)?.workflow_runs ?? [];
    const run = runs[0];
    if (run && run.status === "completed" && !["success", "skipped", "neutral"].includes(run.conclusion ?? "")) {
      const jobs = ((await gh(`/repos/${repo}/actions/runs/${Number(run.id)}/jobs`)) as { jobs?: { steps?: unknown[] }[] } | null)?.jobs ?? [];
      const neverStarted = jobs.length > 0 && jobs.every((j) => !j.steps || j.steps.length === 0);
      return [{
        name: BUILD,
        state: "bad",
        detail: neverStarted ? "GitHub didn't start the build. That's almost always a failed payment or the Actions spending limit."
          : `The last build on ${branch} failed (${run.conclusion}).`,
        fix: neverStarted ? "GitHub > Settings > Billing and plans: fix the payment method or raise the spending limit, then re-run the build."
          : "Open the build in GitHub Actions to see which check failed.",
      }];
    }
    return [{ name: BUILD, state: "ok", detail: run ? "last build ran fine" : "no builds yet" }];
  } catch (e) {
    return [{ name: BUILD, state: "warn", detail: `Couldn't reach GitHub: ${(e as Error).name}`,
      fix: "If this keeps up, the token may have expired. Make a new one and update GITHUB_STATUS_TOKEN." }];
  }
}

// Results are kept for 6 hours (per web instance) so a monitor checking often doesn't hammer GitHub or the registries.
let cached: { at: number; items: UpkeepItem[] } | null = null;

export async function checkUpkeep(now = new Date(), get: Getter = getJson, fresh = false): Promise<UpkeepItem[]> {
  if (!fresh && cached && now.getTime() - cached.at < CACHE_MS) return cached.items;
  const items = [...(await domainItems(now, get)), ...(await buildItems(now, get))];
  cached = { at: now.getTime(), items };
  return items;
}

export function resetUpkeepCache() { cached = null; }

// True only for "Bearer <UPKEEP_TOKEN>" when UPKEEP_TOKEN is at least 24 characters. Constant-time compare.
export function upkeepAuthorized(authorization: string | null | undefined, want = process.env.UPKEEP_TOKEN ?? ""): boolean {
  const got = (authorization ?? "").replace(/^Bearer\s+/i, "");
  if (want.length < 24 || !/^Bearer\s+/i.test(authorization ?? "")) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const NO_STORE = { "cache-control": "no-store" };

export async function upkeepResponse(authorization: string | null | undefined, now = new Date(), get: Getter = getJson): Promise<Response> {
  if (!upkeepAuthorized(authorization)) return new Response("Not Found", { status: 404, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" } });
  const items = await checkUpkeep(now, get);
  const ok = !items.some((i) => i.state === "bad");
  return Response.json({ ok, items }, { status: ok ? 200 : 503, headers: NO_STORE });
}
