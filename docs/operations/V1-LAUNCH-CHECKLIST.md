# BandWagon v1 Launch Checklist

This is the authoritative go/no-go list for the FloMoGo v1 launch. A checked item must have dated evidence in the private launch record; configuration existing in source code is not evidence that a production control works.

## Automated release gate

- [ ] Pull request CI passes migrations, schema verification, migration repeatability, unit tests, TypeScript, production build, cron/deep-health smoke, and load smoke.
- [ ] `npm run release:check-env:flomogo` passes against the production secret set without exposing values.
- [ ] The exact release commit is deployed to staging and recorded.
- [ ] No unresolved severity 1 or severity 2 defects remain.

The `core` environment profile permits a safe deployment while external integrations are pending. Only the `flomogo` profile is sufficient for launch.

## External approvals and provider controls

- [ ] Twilio sender/brand/campaign approval is complete.
- [ ] SMS opt-in, STOP, HELP, inbound action, and fallback tests pass on production credentials.
- [ ] Google OAuth consent/verification is complete and the exact production redirect URI is approved.
- [ ] Google read-only calendar connection and sync pass for FloMoGo.
- [ ] Google Maps server and browser keys are restricted to the required APIs and production origins.
- [ ] If AI is enabled, a dedicated LiteLLM virtual key has the same or stricter monthly cap as BandWagon.
- [ ] If AI is enabled, provider retention, training, region, and prompt/body logging settings have recorded evidence.

Twilio and Google approval are launch blockers, not code blockers. Do not mark them complete until the providers approve them and a production smoke test succeeds.

## Production operations

- [ ] Production PostgreSQL/PostGIS and Redis are private and healthy.
- [ ] Database backups are enabled, encrypted, retained, and monitored.
- [ ] A current production backup restores into an isolated database; schema and core row counts verify.
- [ ] Key rotation procedure has named operators and a maintenance window.
- [ ] Error ingestion, uptime monitoring, status bridge, and all cron jobs have fresh successful heartbeats.
- [ ] Support, privacy, security, and safety escalation contacts are staffed and tested.
- [ ] Monitoring and messaging/AI cost baselines are recorded.

## FloMoGo tenant

- [ ] Production domain and tenant branding are correct.
- [ ] Primary and backup organization administrators can sign in.
- [ ] Join codes, membership policy, driver requirements, handshake policy, and location retention are approved.
- [ ] Organizer-created manual events work; ordinary members cannot publish events.
- [ ] Production calendar sources are selected and sync health is green.
- [ ] Sponsor/support configuration is approved.
- [ ] Seed users, test rides, test events, and test documents are removed.
- [ ] Parent, student, and driver pilot participants are confirmed.

Member-created event proposals are deliberately out of scope for v1. A future organization policy may enable moderated proposals; members must never directly publish an event by default.

## Human regression and safety drills

- [ ] New parent joins, creates a household, adds/claims a student account, and joins FloMoGo.
- [ ] Parent requests a ride; eligible driver offers; parent accepts; both complete the ride.
- [ ] Multi-organization and tenant-isolation checks show no cross-tenant data.
- [ ] Ineligible/expired driver is blocked and an administrator can see why.
- [ ] Ride reminders and emergency notification paths reach the intended recipients.
- [ ] Pickup handshake succeeds for parent, student, and driver scenarios.
- [ ] Expired, replayed, wrong-person, and mismatch handshakes fail safely.
- [ ] Exact locations remain hidden from unauthorized users and are deleted by retention policy.
- [ ] Keyboard, screen-reader, zoom, reduced-motion, mobile, install, and offline-state checks pass.
- [ ] Privacy export and deletion workflows pass with AI history included.

## Documentation and release control

- [ ] Parent/guardian, student, driver, and organization-admin guides are reviewed.
- [ ] Privacy, terms, PWA install, incident response, and safety escalation documents are approved.
- [ ] v1 release notes and version are final.
- [ ] Launch change freeze begins after the release candidate passes.
- [ ] Rollback owner, decision threshold, and procedure are recorded.
- [ ] Seven-day review and 30-day retrospective are scheduled.

## Sign-off record

Record each sign-off outside the public repository if it contains names, phone numbers, provider identifiers, or infrastructure details.

| Area | Owner | Date (UTC) | Evidence | Result |
| --- | --- | --- | --- | --- |
| Engineering/CI |  |  |  |  |
| Security/privacy |  |  |  |  |
| Production operations |  |  |  |  |
| FloMoGo organization |  |  |  |  |
| Safety drill |  |  |  |  |
| Launch decision |  |  |  |  |

The launch decision is **GO** only when every required item above is complete. Any open item is **NO-GO** unless it is explicitly removed from v1 scope without weakening the v1 definition.
