# Known Issues

Gaps found while reviewing the code for the September 2026 docs refresh, rechecked against `main` in October 2026 (the feature request rate limit gap is fixed and was removed). None of these are outages. Each one should become a GitHub issue or a small PR.

## Messaging

- **Some texts don't start with "BandWagon".** Waitlist offers, route-assist, "Your driver is on the way.", event proposal and household delegate texts send `request.body` as-is through `notification-router`. Carriers expect the brand name in every text. Fix: add a `BandWagon:` prefix for the SMS/RCS channel.
- **Web opt-in after a carrier STOP.** `recordSmsConsent` marks the number opted in, but Twilio keeps blocking it until the person texts START. The welcome text then fails. Fix: tell the person to text START, or check the opt-out registry before showing success.
- **Delivery log shows the requested channel.** "Auto" sends are logged as `rcs` even when Twilio falls back to SMS. Fix: read the real channel from the status callback.
- **Phone row lookup mismatch.** `twilio-send.ts` picks the phone by `created_at`, `getSmsConsentStatus` by `verified_at`. Fix: use the same rule in both.
- **Waitlist texting is overstated in docs.** `waitlist_offer` allows SMS, but the default "SMS for critical only" preference means most people get push or email. A cancelled carpool texts every waitlisted rider as `last_minute_cancellation`.
- **Delegate notifications have no router policy.** `household_delegate_activity` and `household_delegate_invitation` use the default routine policy.

## Security

- **Hard-coded fallback key.** If both `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` are unset, `src/lib/feature-requests.ts` and `organization-requests.ts` fall back to a fixed string for hashing. Production sets both, but the code should refuse to start instead.
- **Demo security headers.** In `demo/nginx.conf`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` are set at the server level, so nginx drops them inside location blocks that add their own headers. Fix: repeat them in each location or use an include file.

## Households And Events

- **Request-only delegates can't see their own requests.** A delegate with only "Ask For Rides" can create requests, but `getDelegateOverview` lists them only with "See Ride Details".
- **Org setting skipped without an organization.** `canActForChild` skips the organization delegate setting when no `organizationId` is passed.
- **Uneven settings permissions.** Managers can turn delegates off org-wide, but only owners and admins can change event proposal settings.
- **Self-invite check is email only.** You can't invite your own email, but you can invite your own phone number.
- **Stale proposals.** A proposal whose start time has passed can't be approved until the date changes. Turning proposals off leaves queued ones open for review.

## Config And Operations

- **FloMoGo default domain.** `lib/branding.ts` still lists `flomogo.app` as FloMoGo's primary domain. The community is moving to `flomogo.bandwagon.club` first. Confirm which is primary.
- **Synthetic check fails hourly when unconfigured.** `production-synthetic.yml` exits with an error when `PRODUCTION_URL` is unset.
- **Wordmark on dark backgrounds.** "Band" in `bandwagon-logo.svg` is navy and disappears on dark backgrounds. Add a light variant if one is ever needed.
- **Manifest icons.** Both icons use `"purpose": "any maskable"`. Separate `any` and `maskable` icons would look better on some launchers.
- **Old example domain.** `docs/operations/CHANGING-TENANT-DOMAIN.md` uses `bandwagonrides.com` as an example. It's only an example, but it may confuse readers.
