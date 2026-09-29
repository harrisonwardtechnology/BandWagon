# Google OAuth Verification

How to publish and verify the Google Calendar integration so it works for everyone, not just test users.

## Current Status

- Submitted for verification on 2026-09-28.
- Awaiting Google review.

## Why It Matters

- While the app is in **Testing**, only listed test users can connect, and refresh tokens expire after 7 days.
- When a token dies, the calendar connection flips to `reconnect_required` and an admin must reconnect from Integrations.
- Publishing and verifying removes the 7-day limit and the "unverified app" warning.

## What The Code Asks For

From `apps/web/src/lib/google.ts`:

| Scope | Type | Why |
| --- | --- | --- |
| `openid` | Basic | Identify the Google account that connected |
| `email` | Basic | Show which account is connected |
| `profile` | Basic | Show the account's display name |
| `https://www.googleapis.com/auth/calendar.readonly` | **Sensitive** | Read event calendars an admin picks, to create BandWagon events |

- Read-only. BandWagon never writes to Google Calendar.
- Requests offline access (`access_type=offline`, `prompt=consent`) so the nightly sync can run.
- One connection per platform, made by an organization admin in `/admin/integrations/google`.

Other Google services (Maps, Document AI) use API keys or a service account. They do not use this consent screen.

## Redirect URI

- Callback route: `/api/integrations/google/callback`
- Production: `GOOGLE_REDIRECT_URI=https://bandwagon.club/api/integrations/google/callback`
- It must match an authorized redirect URI on the OAuth client exactly.
- Old redirect URIs from earlier domains can be removed after about a year, once no admin uses them.

Env vars (values in Coolify only): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Steps

### 1. Verify The Domain

- Verify `bandwagon.club` in Google Search Console.
- The person who verifies it must also be an **Owner** of the Google Cloud project. Otherwise the domain does not count for the consent screen.

### 2. Branding

Google Auth Platform > Branding:

| Field | Value |
| --- | --- |
| App name | BandWagon |
| User support email | support@bandwagon.club |
| App logo | `apps/web/public/brand/google-oauth-logo-120.png` (120x120) |
| App home page | https://bandwagon.club |
| Privacy policy | https://bandwagon.club/privacy |
| Terms of service | https://bandwagon.club/terms |
| Authorized domain | bandwagon.club |
| Developer contact | support@bandwagon.club |

- The logo must match the logo on the home page. Reviewers compare them.
- Changing the logo later restarts brand review.

### 3. Publish

- Audience > **Publish app**. This moves it from Testing to In production.

### 4. Data Access

- Add the scopes from the table above.
- Justification for `calendar.readonly`: "Organization admins connect a Google Calendar so BandWagon can read school and band event times and create ride events for members. BandWagon only reads events. It never edits or deletes calendar data."

### 5. Demo Video

- Upload an **unlisted** YouTube video.
- Show: the BandWagon home page and URL, an admin signing in, opening Integrations, clicking Connect Google, the consent screen with the app name and scopes, picking a calendar, and events appearing in BandWagon.
- Show the browser address bar so the OAuth client ID is visible in the consent URL.
- Paste the link into the verification form.

### 6. Submit

- Verification Center > **Submit for verification**.
- Watch support@bandwagon.club for questions from Google. Reply in the same thread.

## Timelines

- Brand verification: about 2 to 3 business days.
- Sensitive scope verification: about 1 to 2 weeks.

## After Approval

- Reconnect the Google Calendar in `/admin/integrations/google` so the new token has no 7-day limit.
- Confirm the nightly sync runs.
- Update the [V1 Launch Checklist](V1-LAUNCH-CHECKLIST.md).

## Lessons Learned

- The first logo was rejected as **not unique**. The generic "Bw" letter mark looked like other brands. The new "Route To The Show" logo replaced it. See [BRANDING.md](../BRANDING.md).
- Do not reuse the BandWagon logo in other Google Cloud projects. Google can flag it as a copy.
