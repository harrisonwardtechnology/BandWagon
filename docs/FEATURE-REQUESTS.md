# Feature Requests

Families, drivers, students, and organization admins can suggest ideas for BandWagon and vote on ideas from others. Migration `057_feature_requests.sql` adds the tables.

## Where It Lives

- Public page: `/help/ideas` ("Ideas And Feature Requests").
- Linked from the Help Center (`/help`) and from the Notifications and Privacy settings tabs as **Suggest A Feature**.
- API: `/api/feature-requests` (submit, vote, list).
- Admin review: `/admin/feature-requests`, API `/api/admin/feature-requests`.

## Who Can Submit

- **Signed-in people** can submit, browse, and vote.
- **Signed-out visitors** can submit only when Cloudflare Turnstile is configured (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`). Without it, the API answers "Sign in to suggest a feature" (HTTP 503).
- Signed-out visitors cannot browse or vote. Voting requires sign-in.
- Support View sessions cannot submit or vote.

## Fields

| Field | Rules |
| --- | --- |
| Title | 5 to 120 characters, no links |
| Details | 10 to 4,000 characters, at most 3 links |
| Category | Rides, Events, Messaging and notifications, Safety, Accessibility, Organization admin tools, Something else |
| Email | Required only when signed out, so the team can follow up |

Everything is stored and shown as plain text. HTML tags and control characters are removed, and links are never turned into anchors.

## Spam And Abuse Protection

- **Turnstile** for signed-out submissions, checked server side with the action `feature_request`.
- **Honeypot**: a hidden `companyWebsite` field. If a bot fills it, the API returns a quiet success and saves nothing.
- **Hourly rate limits** (Redis, keys are HMAC hashed):
  - 10 submissions per IP
  - 5 submissions per signed-in person
  - 3 submissions per email address (signed out)
  - 60 votes per person
- If Redis is not configured, the rate limits are skipped. If the Redis check errors, submissions are refused and votes are allowed.

## Where Requests Are Stored

- `feature_requests`: title, details, category, status, public note, vote count, duplicate link, and the submitter's `person_id` when signed in.
- A signed-out submitter's email is encrypted at rest (`email_ciphertext`) with a keyed lookup hash. Only platform admins see it decrypted.
- The source IP is stored only as a keyed hash (`source_ip_hash`).
- If the submitter belongs to an organization, the request is tagged with one of their organizations.
- `feature_request_votes`: one row per person per request. `vote_count` is recomputed from this table after every vote change.

## Statuses And Visibility

| Status | Label | Visible to all signed-in people | Can collect votes |
| --- | --- | --- | --- |
| `new` | New | No (submitter only) | No |
| `under_review` | Under review | Yes | Yes |
| `planned` | Planned | Yes | Yes |
| `in_progress` | In progress | Yes | Yes |
| `shipped` | Shipped | Yes | No |
| `declined` | Not planned | No (submitter only) | No |
| `duplicate` | Duplicate | No (submitter only) | No |

People can sort the list by **Most votes** or **Newest** and filter by category. Each person always sees their own submissions, whatever the status.

## How Admins Review Them

- Only platform roles `owner` and `support` can open `/admin/feature-requests`. This is a platform admin tool, not an organization admin tool.
- Admins filter by status and category, change the status, and add a public note (up to 1,000 characters) that submitters and voters can see.
- Only certain status changes are allowed. Nothing moves back to `new`. For example, `shipped` can only go back to `in_progress`, and `declined` can go to `under_review` or `planned`.
- **Marking a duplicate** requires choosing the original. Votes are copied to the original, and a duplicate of a duplicate points at the root idea.
- Every change writes an audit event: `feature_request.status_changed` or `feature_request.note_updated`.

## Emails

- **New idea**: the platform owner (`PLATFORM_OWNER_EMAIL`, or `SUPPORT_EMAIL`) gets an email with a link to the admin page.
- **Status update**: when an idea moves to Planned, Shipped, or Not planned, the submitter gets a best-effort email with the public note and a link to `/help/ideas`. Signed-in submitters get it at their verified email; signed-out submitters at the email they entered.

## Code And Tests

- Rules: `apps/web/src/lib/feature-request-policy.ts`
- Database and email: `apps/web/src/lib/feature-requests.ts`
- Tests: `apps/web/tests/feature-requests.test.ts`
