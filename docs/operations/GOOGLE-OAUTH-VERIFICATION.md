# Google Sign-In And Calendar Verification

BandWagon asks Google for read-only calendar access so organizations can sync events. `calendar.readonly` is a **sensitive scope**, so the app must be published and verified by Google before anyone outside the test user list can connect.

Status as of 2026-09-29: branding updated with the new logo and submitted. Waiting on Google.

## What The App Requests

From `apps/web/src/lib/google.ts`:

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar.readonly` (sensitive)

Callback: `https://bandwagon.club/api/integrations/google/callback` (`GOOGLE_REDIRECT_URI`).

## Branding Page

Google Cloud console, BandWagon project, **Google Auth Platform**, **Branding**:

| Field | Value |
| --- | --- |
| App Name | BandWagon |
| User Support Email | support@bandwagon.club |
| App Logo | `apps/web/public/brand/google-oauth-logo-120.png` (120x120) |
| Home Page | https://bandwagon.club |
| Privacy Policy | https://bandwagon.club/privacy |
| Terms Of Service | https://bandwagon.club/terms |
| Authorized Domains | bandwagon.club |
| Developer Contact | Harrison's email |

The logo must match what the homepage shows. The first logo (the old "Bw" letters) was rejected as "not unique".

## Steps

1. Verify `bandwagon.club` in Google Search Console with the same Google account (Domain property, TXT record in Cloudflare).
2. Fill in Branding (table above) and save.
3. **Audience**: click Publish App.
4. **Data Access**: keep only the scopes above, paste the justification, and add the demo video link.
5. **Verification Center**: Submit For Verification.

## Justification Text

> BandWagon is a privacy-first carpool coordination app for school bands, teams and clubs. Organization admins connect a Google Calendar so their events (practices, games, competitions) appear in BandWagon, where families request and offer rides to those events. We only read events from calendars the admin chooses. We never create, change or delete calendar data, and event data is used only to show ride-eligible events inside that organization.

## Demo Video (Unlisted YouTube)

Show, in one take:

1. The browser address bar on https://bandwagon.club.
2. Signing in as an organization admin.
3. Clicking Connect Google Calendar and the full Google consent screen, with the app name and the `calendar.readonly` scope visible.
4. Picking a calendar and the synced events showing up in BandWagon.
5. A family requesting a ride to one of those events.
6. Disconnecting the calendar.

## Timeline

- Brand check: about 2 to 3 business days.
- Sensitive scope review: about 1 to 2 weeks. Google replies by email and may ask for changes.

## After Verification

- Reconnect the Google Calendar integration in Platform Health (it shows degraded until then).
- About a year after the domain move, remove the old `harrisonward.net` redirect URI from the OAuth client.
