# BandWagon Changelog

## v1.0.0-rc1 - Unreleased

- Completed the v1 ride, household, managed-student, driver, safety, pickup-verification, calendar, privacy, tenant, and operations contract.
- Added organizer-created manual events; ordinary member publishing remains disabled for v1.
- Added production readiness profiles that keep Twilio and Google as explicit FloMoGo launch gates.
- Added privacy-safe error monitoring, staged key rotation, backup/restore verification, PWA/accessibility safeguards, and a repeatable load smoke.
- Added fail-closed AI governance with organization opt-in, budgets, bounds, timeouts, and audited manual fallback.
- Added an authoritative v1 launch checklist and release-candidate notes; general availability remains blocked on the recorded production and human-verification gates.

## v0.8 - Current consolidation
- Consolidated deployed production scaffold and all incremental update packs.
- Added public Privacy, Terms, Messaging and SMS Opt-In pages.
- Added Twilio messaging, delivery status, voice and voice-status webhooks.
- Added Twilio signature validation and Redis idempotency.
- Improved voice greeting pacing and neural voice configuration.
- Added protected platform Messaging Test console.
- Consolidated environment-variable example.
- Documented non-sequential `/r/{8-char}` public ride URL convention.
- Added GitHub social-preview artwork to docs assets.

## Earlier build increments
- v0.7 Messaging admin test
- v0.6 Voice greeting improvements
- v0.5 Twilio webhooks
- v0.4 Strengthened Terms
- v0.3 Public SMS opt-in
- v0.2 Public policy routes
- v0.1 Production scaffold
