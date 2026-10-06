# Analytics (Umami)

BandWagon uses **Umami**, self-hosted at `stats.harrisonward.net`, for anonymous page and feature counts. Decision: on for everyone, no opt-in (October 2026).

## Turn It On

1. In Umami, add a website for `bandwagon.club` and copy its **Website ID**.
2. In Coolify, add build variables `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (and `NEXT_PUBLIC_UMAMI_SRC` only if the script is not at `https://stats.harrisonward.net/script.js`).
3. Redeploy. These values are baked in at build time.

Blank or invalid ID means no script loads at all.

## Privacy Guard Rails

- No cookies and no device storage, so it sits outside the cookie choice.
- `data-exclude-search` and `data-exclude-hash` drop query strings and anchors.
- A `before-send` hook replaces invite and household-invite tokens with `:token`, in both the page and the referrer.
- `data-do-not-track` skips browsers that send Do Not Track.
- `umami.identify()` is never called. Nothing is tied to an account, household or student.

The cookie policy, privacy policy, subprocessors page and privacy banner all describe this. Change them together, and bump `PRIVACY_CONSENT_VERSION` in `src/lib/consent-policy.ts` when what the banner says changes. Tests: `tests/analytics-policy.test.ts`.

## Analytics And Error Tracking At A Glance

| | Umami | GlitchTip |
|---|---|---|
| Purpose | Anonymous page counts | Error grouping and alerts |
| Host | `stats.harrisonward.net` | Your GlitchTip host |
| Switch | `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (build-time) | `GLITCHTIP_DSN` (runtime, secret) |
| Unset means | No script is rendered | Nothing is sent |
| Never sent | Names, emails, phones, user IDs, query strings, invite tokens | The same, plus IPs, cookies, headers, request bodies and ride locations |

Both are set in Coolify, never in git. The Docker Compose examples pass them through blank by default. BandWagon posts GlitchTip events from its own server code with its own redaction, so no third-party SDK runs in the browser. See [ERROR-MONITORING.md](ERROR-MONITORING.md).

Browsers talk to Umami directly, so if you add a Content-Security-Policy, allow `https://stats.harrisonward.net` in `script-src` and `connect-src`. Browser errors go through `/api/client-errors`, so GlitchTip needs no CSP entry.
