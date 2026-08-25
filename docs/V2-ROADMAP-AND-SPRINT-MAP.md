# BandWagon V2 Roadmap and Sprint Map

## Purpose

V2 delivers accessible native iOS and Android applications and the highest-value post-v1 ride, household, organization, security, and notification workflows. The BandWagon backend remains authoritative, and the PWA and desktop web experience remain supported.

Accessibility, localization, privacy, child safety, and tenant isolation are release requirements. They are not cleanup work deferred until the final sprint.

## Planning assumptions

- Two-week sprints.
- A small delivery team with one or two primary engineers plus part-time product, design, security, and testing support.
- The 20-sprint structure is a dependency and acceptance map. With Codex performing the bulk of implementation, the sprints operate as work packages rather than fixed two-week calendar blocks.
- A larger dedicated team can shorten elapsed time, but it should not remove safety, accessibility, privacy, or beta gates.
- Apple, Google, legal/privacy, and provider reviews run in parallel and may affect the release date.
- Every new capability is remotely feature flagged until its release gate passes.

## Release trains

| Release | Target sprints | Outcome |
| --- | --- | --- |
| Foundation | 0-2 | Versioned APIs, native delivery pipeline, design system, localization framework, accessibility automation, device/session model, and offline architecture |
| V2.0 Native Core | 3-10 | Accessible iOS/Android apps with secure sign-in, notifications, active rides, Emergency Assist, pickup verification, credential capture, and initial English/Spanish localization |
| V2.1 Workflow Expansion | 11-14 | Recurring rides/events, waitlists, moderated member event proposals, and trusted household delegates |
| V2.2 Smart Mobility + GA | 15-19 | Capacity-aware pooled planning, widgets/live status, privacy/security hardening, public release candidate, staged rollout, and post-launch review |

## Product principles

1. Safety and privacy outrank convenience.
2. Accessibility and localization are part of the acceptance criteria for every feature.
3. Server-side authorization and organization policy remain authoritative.
4. Native clients do not reimplement or weaken backend safety rules.
5. Users control location sharing; passive background tracking is disabled by default.
6. Push is the routine notification channel; RCS/SMS and email are bounded fallbacks.
7. Members may propose events only when their organization enables it; organizers publish them.
8. Automated matching explains its recommendation and never secretly scores or punishes a driver.
9. Complex organization administration remains web-first unless user evidence justifies native work.
10. No advertising SDKs, open social feed, or general-purpose chat platform.

## Accessibility and localization standard

The following requirements apply to every sprint:

- WCAG 2.2 AA for web and native experiences where the criterion applies.
- VoiceOver and TalkBack labels, reading order, hints, states, headings, and announcements.
- Keyboard, switch-control, and voice-control operation without touch-only traps.
- Dynamic Type / scalable text without clipping, overlap, or lost actions.
- High-contrast and color-blind-safe visual states; color is never the only signal.
- Reduced-motion support and no unnecessary animation.
- Minimum accessible touch targets and large active-ride / emergency controls.
- Plain-language instructions, validation, and recovery messages.
- Text alternatives for maps, route status, QR codes, icons, and visual timelines.
- Per-user language preference and organization default language.
- Guardian and student accounts may use different languages.
- Locale-aware dates, times, time zones, phone numbers, addresses, distance, and units.
- No hard-coded user-facing strings outside the localization catalog.
- English (`en-US`) and Spanish (`es-US`) are the initial V2 target locales; additional locales use the same catalog and review process.
- Safety, emergency, consent, and legal translations require human review before release. Runtime AI translation is not used for these messages.
- Missing translations fall back safely to English and create a visible test/operations signal.
- Transactional email, push, SMS, and RCS use the recipient's approved language when a reviewed template exists.
- Automated accessibility checks are supplemented by manual assistive-technology testing and beta participants with lived experience.

## Definition of done for every feature

A feature is not done until all applicable items pass:

- Product acceptance criteria and documented out-of-scope behavior.
- Server-side authorization and tenant-boundary enforcement.
- Abuse cases, quotas, consent, audit events, and safe failure behavior.
- Accessibility acceptance criteria and manual keyboard/screen-reader review.
- All user-facing strings localized with English and Spanish coverage.
- Unit, integration, and critical-path end-to-end tests.
- Offline, timeout, duplicate-action, and poor-connectivity behavior.
- Privacy classification, retention behavior, and log/analytics review.
- Feature flag, rollout plan, monitoring, support instructions, and rollback path.
- Updated user and organization-admin documentation.

## Sprint map

### Sprint 0 - V2 charter and risk foundation

**Deliverables**

- Freeze the V2.0/V2.1/V2.2 scope and success metrics.
- Select React Native / Expo or document the alternative decision.
- Create the mobile, API, privacy, child-safety, and notification threat models.
- Define supported iOS/Android versions and device test matrix.
- Establish WCAG 2.2 AA and localization release policy.
- Confirm `en-US` and `es-US` launch locales and translation review ownership.
- Inventory current web workflows and server APIs that native clients require.
- Open Apple Developer and Google Play organization workstreams.

**Exit gate:** Architecture decision, threat model, accessibility policy, locale policy, scope, owners, and release metrics are approved.

### Sprint 1 - API and native delivery foundation

**Deliverables**

- Versioned mobile API boundary and compatibility rules.
- Native application skeleton for iOS and Android.
- Signed development builds and CI pipeline.
- Environment separation for development, beta, and production.
- Feature-flag service and emergency kill switch.
- Central localization catalog with missing-string checks.
- Accessible native design tokens and core components.
- Privacy-scrubbed crash/error monitoring.

**Exit gate:** Both platforms build automatically, open the accessible shell, change locale, and report scrubbed health data.

### Sprint 2 - Session, navigation, and offline shell

**Deliverables**

- Secure Keychain/Keystore token storage.
- Device registration and server-side session model.
- Household and organization switcher.
- Deep-link / universal-link routing.
- Offline cache for essential active-ride data.
- Queue and retry policy for noncritical actions.
- Automated accessibility and localization checks in CI.

**Exit gate:** A test user can sign in, switch organizations, reopen offline, and navigate the complete shell with VoiceOver, TalkBack, and keyboard controls.

### Sprint 3 - Passkeys and security center

**Deliverables**

- Passkeys/WebAuthn registration and authentication.
- Optional biometric unlock after normal authentication.
- Active device and session inventory.
- Recent sign-ins and approval history.
- One-tap session revocation.
- Lost-device and account-recovery flow.
- Suspicious approval denial/reporting.

**Exit gate:** Passkey, recovery, revocation, replay, stolen-session, and cross-tenant tests pass.

### Sprint 4 - Push, RCS, and login approval

**Deliverables**

- APNs and FCM device-token lifecycle.
- Device-level notification preferences.
- Signed, single-use push login approvals.
- RCS approval/OTP fallback with number matching.
- SMS and email recovery fallback.
- Requesting device, organization, approximate location, and time display.
- Approval-expiration, replay protection, fatigue limits, audit trail, and denial/report controls.
- Localized notification templates.

**Exit gate:** Push-first approval and every fallback pass legitimate, replay, spoofing, rate-limit, opt-out, and translation tests.

### Sprint 5 - Native active-ride core

**Deliverables**

- Parent, student, and driver active-ride screens.
- Driver arriving, arrived, pickup, drop-off, cancellation, and no-show actions.
- Large accessible primary controls and status announcements.
- Navigation handoff to installed mapping applications.
- Calendar open/add actions.
- Offline display and safe duplicate-action handling.

**Exit gate:** A complete ride works on iOS and Android under normal and poor-connectivity conditions without bypassing server-side lifecycle rules.

### Sprint 6 - Emergency Assist and controlled location sharing

**Deliverables**

- Prominent Emergency Assist entry point.
- Direct device Call 911 action and clear non-dispatch disclaimer.
- Guardian/safety-circle notification.
- Optional user-initiated live-location sharing during active ride or safety event.
- Foreground/background permission explanations.
- No passive tracking by default.
- Post-incident check-in and escalation record.
- Localized, human-reviewed safety language.

**Exit gate:** Safety drill passes for parent, student, driver, denied permission, no network, wrong organization, and expired ride scenarios.

### Sprint 7 - Verified Pickup Handshake

**Deliverables**

- Native camera QR scanning.
- Accessible phrase/code fallback.
- Wrong-person, wrong-ride, mismatch, expiration, and replay handling.
- Clear screen-reader status and non-color confirmation states.
- Optional NFC/proximity research spike without making it a release dependency.

**Exit gate:** Parent, student, driver, assistive-technology, replay, mismatch, and offline-fallback tests pass.

### Sprint 8 - Driver credential capture

**Deliverables**

- Native camera and photo-picker integration.
- On-device crop, compression, rotation, and quality guidance.
- Private S3 upload and retry/resume behavior.
- Organization-specific requirement display.
- Expiration reminders and plain-language eligibility explanations.
- Sensitive-data exclusion from notifications, analytics, logs, screenshots, and crash reports.

**Exit gate:** Valid, invalid, expired, revoked, offline, oversized, malicious-file, and privacy tests pass.

### Sprint 9 - Localization and accessibility completion pass

**Deliverables**

- Complete `en-US` and `es-US` mobile catalogs.
- Localized email, push, SMS, and RCS templates.
- Locale-aware time zones, dates, distances, addresses, and phone formats.
- Guardian/student mixed-language behavior.
- Text alternatives for maps and active-ride visual states.
- Dynamic Type, contrast, reduced-motion, keyboard, switch, VoiceOver, and TalkBack remediation.
- Human review of safety, consent, recovery, and legal translations.

**Exit gate:** No critical untranslated strings or severity 1/2 accessibility defects; human accessibility and Spanish-language walkthroughs pass.

### Sprint 10 - V2.0 beta and store readiness

**Deliverables**

- TestFlight and Google Play closed beta.
- App Privacy and Data Safety disclosures.
- Age rating, child-safety, privacy, and account-deletion review.
- Native support guide and in-app feedback/reporting.
- Performance, battery, startup, and crash baselines.
- V2.0 rollback drill and staged-release plan.

**Exit gate:** V2.0 beta completes the parent/student/driver matrix with no open severity 1/2 defects and approved privacy/store evidence.

### Sprint 11 - Recurring rides and events

**Deliverables**

- Recurring ride and event templates.
- Weekday, school-day, start/end, and time-zone rules.
- Holiday and calendar exceptions.
- Skip/change one occurrence without altering the series.
- Series and occurrence cancellation.
- Conflict detection across Google, Microsoft, and manual events.
- Accessible recurrence editor and localized schedule summaries.

**Exit gate:** Daylight-saving, time-zone, holiday, cancellation, duplicate, and notification tests pass.

### Sprint 12 - Waitlists and standby offers

**Deliverables**

- Capacity-based waitlist.
- Expiring and auditable ride offers.
- Accept, decline, withdraw, and expiration states.
- Guardian approval where required.
- Automatic offer to the next eligible participant.
- Accessible countdown/status behavior without relying only on motion or color.

**Exit gate:** Concurrency, capacity, expiry, guardian, notification, accessibility, and fairness tests pass.

### Sprint 13 - Moderated member event proposals

**Deliverables**

- Organization-level enable/disable policy.
- Member event draft submission.
- Organizer review, edit, approve, reject, and publish workflow.
- Required fields and organization-specific rules.
- Submission limits, abuse reporting, and audit history.
- Members never receive direct publish authority by default.

**Exit gate:** Role, tenant, policy-disabled, abuse, approval, rejection, and publication tests pass.

### Sprint 14 - Trusted household delegates

**Deliverables**

- Backup guardians and pickup contacts.
- Temporary delegates with start and expiration dates.
- Permissions scoped by student, organization, and action.
- Guardian approval and change notification.
- Visible delegate history and immediate revocation.
- Emergency removal and compromised-account handling.

**Exit gate:** Expired, revoked, wrong-student, wrong-organization, guardian-dispute, and audit tests pass.

### Sprint 15 - Capacity-aware pooled planning

**Deliverables**

- Capacity, seating, accessibility, time-window, and location constraints.
- Suggested passenger grouping and pickup/drop-off order.
- Plain-language explanation of each suggestion.
- Driver and organizer retain final control.
- No hidden driver score or automated punitive decision.
- Route usage, fallback, cost, and quality monitoring.

**Exit gate:** Capacity, accessibility, safety, route failure, fairness, cost-limit, and organizer-override tests pass.

### Sprint 16 - Widgets and live ride status

**Deliverables**

- Privacy-safe next-ride home-screen widget.
- iOS Live Activity / Dynamic Island where supported and approved.
- Android ongoing-ride notification.
- Native QR organization joining and event check-in.
- Lock-screen privacy controls and localized compact layouts.

**Exit gate:** Stale-state, lock-screen exposure, logout, account-switch, accessibility, battery, and unsupported-device tests pass.

### Sprint 17 - Privacy, abuse, and resilience hardening

**Deliverables**

- Mobile privacy export and account deletion.
- Retention and exact-location deletion validation.
- Messaging, notification, invitation, and proposal abuse tests.
- Mobile/API penetration test and dependency review.
- Load, retry-storm, offline queue, and duplicate-action testing.
- Backup restore and production rollback drill.
- Monitoring, cost, stale-reservation, and scheduled-job alerts.

**Exit gate:** No unresolved severity 1/2 defect; security/privacy sign-off and restore/rollback evidence complete.

### Sprint 18 - V2 public release candidate

**Deliverables**

- Feature freeze and release-candidate builds.
- Full parent, student, driver, organizer, delegate, accessibility, and language regression.
- Store submissions and production listing content.
- Support, incident, safety, privacy, and status-page readiness.
- Compatibility validation against the production backend.
- Final release notes and known limitations.

**Exit gate:** Every required V2 launch checklist item has dated evidence and named approval.

### Sprint 19 - Staged GA and stabilization

**Deliverables**

- Employee/internal rollout, then 5%, 25%, 50%, and 100% staged release.
- Health, crash, latency, cost, notification, and support monitoring at every stage.
- Kill-switch and rollback thresholds enforced.
- Seven-day stabilization review.
- Thirty-day V2 retrospective and V2.3/post-V2 backlog decision.

**Exit gate:** V2 is generally available with stable health, support ownership, recorded baselines, and no unresolved launch blocker.

## Feature-to-release map

| Capability | V2.0 | V2.1 | V2.2 |
| --- | :---: | :---: | :---: |
| Accessible native iOS/Android shell | Yes | Improve | Improve |
| English and Spanish localization | Yes | Maintain | Maintain |
| Passkeys and security center | Yes | Improve | Improve |
| Push/RCS login approval | Yes |  |  |
| Native active-ride experience | Yes | Improve | Improve |
| Emergency Assist | Yes | Improve | Improve |
| Verified Pickup QR/phrase | Yes |  | Improve |
| Driver credential capture | Yes |  |  |
| Recurring rides/events |  | Yes | Improve |
| Waitlists/standby offers |  | Yes | Improve |
| Member event proposals |  | Yes | Improve |
| Household delegates |  | Yes | Improve |
| Capacity-aware pooled planning |  |  | Yes |
| Widgets/live ride status |  |  | Yes |
| Public mobile GA |  |  | Yes |

## Deliberately excluded from V2

- General-purpose or open-ended chat.
- Public social feed or public people directory.
- Direct event publishing by ordinary members.
- Passive background location tracking by default.
- Advertising networks or behavioral advertising SDKs.
- Hidden driver rankings, public leaderboards, or punitive automated scoring.
- Unreviewed AI translation of emergency, consent, legal, or safety content.
- Broad public APIs before a dedicated threat model and tenant-isolation controls exist.
- White-label mobile applications unless paid demand justifies the ongoing operational burden.
- CarPlay/Android Auto until safety and platform-policy review is complete.

## Schedule and staffing reality

For a conventional small product team, this represents approximately 40 weeks of planned work. A practical conventional-team range is:

- **One primary engineer:** 10-14 months.
- **Two engineers with part-time design/QA/security:** 8-10 months.
- **Three or four dedicated engineers plus design/QA:** 6-8 months.

Adding engineers does not linearly compress provider approval, beta feedback, accessibility testing, privacy review, or store review. Those gates should run in parallel as early as possible.

### Codex-led delivery target

When Codex performs the bulk of architecture, coding, migrations, automated testing, documentation, and CI/CD work, the 20 sprints are executed as compressed work packages:

| Milestone | Target elapsed time | Scope |
| --- | ---: | --- |
| Foundation complete | 1-2 weeks | Native project, APIs, CI/CD, design system, localization/accessibility framework |
| V2.0 private beta | 5-7 weeks | Authentication, notifications, active rides, safety, pickup verification, credentials, English/Spanish beta |
| Public release candidate | 10-12 weeks | V2.1 workflows, pooled planning, widgets, security/privacy/accessibility hardening |
| Staged general availability | 14-18 weeks | Real-user remediation, provider/store review, staged rollout, and stabilization |

This schedule assumes prompt product decisions and access to required provider accounts. Codex can compress implementation, test creation, documentation, and remediation. It cannot responsibly eliminate physical-device testing, real-user accessibility testing, human review of Spanish safety/legal translations, child-privacy review, beta observation, or Apple/Google approval time.

## V2 success measures

- A parent, student, or driver can complete the essential ride workflow on iOS, Android, or web without assistance.
- English and Spanish users receive consistent, reviewed transactional and safety information.
- Critical workflows pass VoiceOver, TalkBack, keyboard, switch-control, zoom, and Dynamic Type testing.
- Push handles routine notifications while bounded RCS/SMS/email fallbacks work when needed.
- No cross-tenant access, unauthorized delegate action, direct member event publication, or replayed pickup/login approval succeeds.
- Crash-free sessions, API reliability, notification delivery, support volume, and cost remain within the approved launch baseline.
- The organization can enable or disable proposals and advanced workflows without a developer changing core code.
