# Feature Requests

Families, drivers, students, and organization admins can suggest ideas for BandWagon, vote on ideas the team is reviewing, and follow what happens to their own ideas. The BandWagon platform team reviews every idea.

## Where People Find It

- Public page: `/help/ideas` ("Ideas And Feature Requests"). Linked from the Help Center and from the Settings tabs (Notifications, Privacy & Data).
- Platform admin queue: `/admin/feature-requests`, linked from the platform overview at `/admin/platform`.
- Bug reports and account problems belong in Contact BandWagon Support (`/help#contact-support-title`), not here. The page says so.

## What Users Can Do

Signed in:

- Send an idea with a title, details, and a category.
- Browse ideas that are Under review, Planned, In progress, or Shipped, plus every idea they sent themselves (any status).
- Vote once per idea. Voting is open only while an idea is Under review, Planned, or In progress.
- Sort by Most votes (default) or Newest, and filter by category.

Signed out:

- Send an idea only. An email address is required so the team can follow up.
- A Cloudflare Turnstile check is required. If Turnstile is not configured, the public form is turned off and the page asks the person to sign in.
- Signed-out visitors cannot browse or vote.

Support View sessions cannot submit or vote.

## Categories And Statuses

Categories (labels as shown): Rides, Events, Messaging and notifications, Safety, Accessibility, Organization admin tools, Something else.

Statuses and allowed moves (`src/lib/feature-request-policy.ts`):

| From | Can Move To |
| --- | --- |
| `new` | `under_review`, `planned`, `in_progress`, `shipped`, `declined`, `duplicate` |
| `under_review` | `planned`, `in_progress`, `shipped`, `declined`, `duplicate` |
| `planned` | `under_review`, `in_progress`, `shipped`, `declined`, `duplicate` |
| `in_progress` | `planned`, `shipped`, `declined` |
| `shipped` | `in_progress` |
| `declined` (shown as "Not planned") | `under_review`, `planned` |
| `duplicate` | `under_review` |

Nothing moves back to `new`. New ideas stay private to the submitter and the platform team until someone moves them to a public status.

## What Platform Admins Do

At `/admin/feature-requests`, platform owners and support staff (platform roles `owner` and `support`) can:

- Filter by status and category, and sort by votes or newest.
- See the submitter's name, organization, and, for signed-out ideas, the decrypted email.
- Change the status and add a public note (up to 1,000 characters). The note is shown to everyone who can see the idea.
- Mark an idea as a duplicate of another. Votes carry over to the original, and duplicate chains are kept one level deep.

Each change is written to `audit_events` as `feature_request.status_changed` or `feature_request.note_updated`.

## Notifications

- New idea: an email goes to `PLATFORM_OWNER_EMAIL` (or `SUPPORT_EMAIL` if that is unset). If neither is set, no email is sent.
- Status change to Planned, Shipped, or Not planned: the submitter gets an email with the status and any public note. Signed-in submitters get it at their first verified email. Signed-out submitters get it at the address they gave.
- Emails go through `sendEmailNotification` directly and are best effort. A failed email never blocks the save.

## How It Works

| Piece | Location |
| --- | --- |
| Tables | `feature_requests`, `feature_request_votes` (migration `057_feature_requests.sql`) |
| Pure rules | `src/lib/feature-request-policy.ts` |
| Database work | `src/lib/feature-requests.ts` |
| Member API | `GET` and `POST /api/feature-requests` (`action`: `create` or `vote`) |
| Admin API | `GET` and `POST /api/admin/feature-requests` |
| UI | `src/components/feature-ideas.tsx`, `src/app/help/ideas/page.tsx`, `src/app/admin/feature-requests/page.tsx` |

`feature_request_votes` has one row per person per idea (primary key). `feature_requests.vote_count` is recounted from that table after every vote change.

## Limits

- Title 5 to 120 characters. Details 10 to 4,000 characters. Email up to 320 characters.
- No links in the title, and at most 3 links in the details.
- Hourly rate limits in Redis: 10 ideas per IP, 5 per signed-in person, 3 per email, and 60 votes per person.
- A hidden honeypot field (`companyWebsite`) makes bots get a quiet success with nothing saved.
- Lists return at most 200 ideas for members and 300 for admins.

## Privacy And Safety

- Minors use BandWagon, so all text is plain text. HTML tags and control characters are stripped, and links are never turned into anchors.
- A signed-out email is encrypted at rest (`email_ciphertext`) with a keyed lookup hash, like other contact data.
- The source IP is stored only as a keyed hash (`source_ip_hash`). Rate limit keys are also keyed hashes.
- Members never see who else submitted or voted on an idea.
- Responses use `cache-control: no-store, private`.

## Configuration

| Variable | Used For |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Signed-out submissions. Both are required or the public form is off. |
| `REDIS_URL` | Rate limits. Without Redis, rate limits are skipped. |
| `PLATFORM_OWNER_EMAIL`, `SUPPORT_EMAIL` | New idea emails to the team. |
| `DATA_ENCRYPTION_KEY`, `AUTH_SECRET` | Email encryption and keyed hashes. |
| `APP_URL` | Links in emails. |

## Tests

`tests/feature-requests.test.ts` covers validation, length limits, HTML and link stripping, the status transitions, visibility and voting rules, fixed sort clauses, that category and status lists match the migration, the one vote per person rule, and that the routes rate limit, check Turnstile, and gate the admin API.
