# BandWagon Roadmap Through v2

This roadmap intentionally uses larger release packages: one release PR, one review/merge, one deployment, and one migration run per release.

## 0.13 - Safety & Trust
**Goal:** Make the real-user product safe enough to begin structured pilot use.

- 13+ direct-account age screen and guardian model
- Emergency Assist / safety-circle alerts
- private IONOS S3 credential vault
- organization-defined driver requirements
- district-approved volunteer status
- driver license / insurance uploads
- LiteLLM AI Gateway
- Google Document AI license processing path
- insurance AI fact extraction
- human organization approval workflow
- deterministic driver eligibility enforcement
- credential expiration enforcement / reminders
- Safety & Trust operations dashboard
- AI spend / purpose accounting
- sponsorship impact: ~$0.25 per ride / ~$0.50 per driver validation

**Exit:** Build is green, migrations 018-023 apply, S3 upload works, eligibility blocks unapproved drivers, Emergency Assist test succeeds.

---

## 0.14 - Operations & Engagement
**Goal:** Make BandWagon pleasant enough that families and org admins use it without hand-holding.

### Ride / notification lifecycle
- scheduled 24-hour and 1-hour reminders
- driver-arriving / pickup / drop-off lifecycle polish
- no-show / cancellation UX
- notification preferences and delivery health
- SMS/RCS cost controls and fallback metrics

### Verified Pickup Handshake
- rider / guardian scans a short-lived QR code presented by the assigned driver at pickup
- server verifies that the driver, rider, ride, organization, and pickup window all match
- both devices display the same memorable one-time phrase, such as `Blue Cow` or `Pink Spoon`
- pair the phrase with a large visual treatment / icon; never rely on color alone for accessibility
- optional short numeric fallback when QR scanning is unavailable
- both sides explicitly confirm the match before pickup is marked verified
- one-time challenge expires quickly and cannot be reused on another ride
- record successful / failed / cancelled handshake events in the ride audit trail
- configurable by organization as Optional / Recommended / Required
- parent / guardian can require handshake for a specific minor even when the organization does not
- failed mismatch should clearly say `Do Not Enter Vehicle` and offer Call Guardian / I Need Help
- no personal secret questions, DOB, phone number, address, or reusable code words are exposed

**Suggested flow:**

```text
Driver Arrives
      |
      v
Driver opens Pickup QR
      |
      v
Rider / Guardian scans
      |
      v
BandWagon validates both participants + ride + pickup window
      |
      v
DRIVER DEVICE              RIDER DEVICE
BLUE COW                    BLUE COW
[ Cow icon ]                [ Cow icon ]
      |                           |
      +------ both confirm -------+
                  |
                  v
          PICKUP VERIFIED
                  |
                  v
           Ride -> Picked Up
```

### Calendar / event experience
- polished upcoming-events UI
- calendar sync health / last-sync status
- manual event editing
- AI: paste email/text/screenshot -> proposed event
- admin confirmation before AI-created event is published
- ride arrival/departure target times

### Matching / explanation
- human-in-loop smart matching UX
- clear `Why this match?` explanations
- better multi-passenger/carpool presentation
- coverage / unmet-demand view

### Community support
- sponsor display / logo workflow
- organization support page branding
- cost coverage dashboard refinement
- monthly support summaries

**Exit:** A normal parent can join, add family, request/offer/complete a ride, verify the correct driver/rider at pickup, and receive the correct reminders without admin assistance.

---

## 0.15 - SaaS, Privacy & Production Candidate
**Goal:** Turn the working product into a repeatable multi-tenant SaaS and production candidate.

### SaaS / tenant onboarding
- `{tenant}.harrisonward.org` activation workflow
- verified custom domains
- org branding / logo / support settings
- tenant administrator onboarding
- organization setup checklist
- configurable join codes and policies

### Calendar expansion
- [x] Microsoft Calendar integration
- [x] Google / Microsoft sync controls per organization
- [x] duplicate / conflict handling
- [x] organizer-created manual events
- [ ] decide whether organizations may opt into member-created event proposals after v1

### Privacy / family controls
- [x] user data export
- [x] right-to-be-forgotten workflow
- [x] document deletion / retention lifecycle
- [x] guardian consent management polish
- [x] student account / household management polish
- [x] organization privacy / terms acknowledgement
- [x] exact-location retention cleanup

### Security / reliability
- [x] stronger auth/IP throttling
- [x] account-enumeration hardening
- [x] session / cookie hardening review
- [x] admin audit export
- [x] secret / key rotation procedure and data re-encryption tooling
- [ ] production backup / isolated restore verification (tooling ready)
- [x] centralized error / health monitoring
- [x] shared-shell accessibility and keyboard safeguards (production assistive-technology matrix remains)
- [x] mobile/PWA install and privacy-safe offline-state polish
- [x] repeatable performance / load smoke gate (staging authenticated load test remains)

### AI governance
- [x] BandWagon hard caps, in-flight reservations, and approved model aliases
- [x] fail-closed runtime switch, input bounds, and provider timeouts
- [x] policy decision / manual fallback audit history
- [ ] production LiteLLM virtual key and matching gateway budget
- [ ] provider retention / training / region configuration evidence
- [ ] verify prompt/body logging disabled in production gateway and providers

**Exit:** A second organization can be onboarded without code changes; privacy deletion/export and disaster recovery are tested; production security checklist is complete.

---

## 1.0 - FloMoGo Production + General Availability
**Goal:** Ship the first production tenant and freeze the v1 contract.

The executable go/no-go criteria live in [`operations/V1-LAUNCH-CHECKLIST.md`](operations/V1-LAUNCH-CHECKLIST.md). Twilio and Google approval may proceed in parallel, but both remain launch blockers for the FloMoGo profile.

### FloMoGo launch
- production tenant/domain configuration
- organization admins assigned
- calendar sources connected
- driver requirements approved by the organization
- seed/test data removed
- sponsor/support configuration
- support contacts / procedures
- parent + driver pilot group
- safety drill / ride workflow dry run
- verified pickup handshake dry run with parent, student, and driver scenarios

### Release validation
- end-to-end regression test
- tenant isolation test
- household / multi-org test
- credential / eligibility test
- emergency notification test
- verified pickup handshake / replay / mismatch test
- location privacy test
- backup restore test
- accessibility / mobile test
- documentation review

### Documentation
- parent / guardian guide
- student guide
- driver guide
- organization admin guide
- privacy / terms
- PWA install guide
- incident / safety escalation guide
- open-source installation / environment guide

### v1 release
- version / release notes
- production change freeze for launch
- monitoring / cost baseline
- 7-day post-launch review
- 30-day v1 retrospective

**v1 definition:** BandWagon can safely run FloMoGo and onboard another organization without a developer changing the core product.

---

## 2.0 - Native Mobile Apps
**Goal:** Deliver first-class iOS and Android apps without forking BandWagon into three separate products.

### Mobile architecture
- keep the BandWagon backend, data model, authorization, safety rules, tenant isolation, AI gateway, and notification engine authoritative
- expose stable versioned application APIs for web, iOS, and Android clients
- build one shared native codebase where practical; React Native / Expo is the leading candidate because BandWagon already uses TypeScript / React
- keep the PWA and desktop web experience fully supported for accessibility, admin workflows, and users who do not install an app
- define deep links / universal links so ride requests, approvals, safety alerts, and organization invitations open directly in the correct screen

### Native account / identity
- secure token storage using iOS Keychain and Android Keystore
- device registration and session management
- biometric unlock as an optional convenience layer after normal BandWagon authentication
- Sign in with Apple / Google where useful, while preserving email / phone OTP and organization policies
- passwordless login approval using a signed, single-use device challenge delivered by push first and branded RCS when supported
- push / RCS approval displays the requesting device, approximate location, time, organization, and a number-match challenge before Approve or Deny
- RCS one-time passcodes and approval links as a fallback for users without an active push-capable device; SMS and email remain recovery fallbacks
- approval requests expire quickly, cannot be replayed, are rate-limited, and trigger audit events and user-visible denial/report controls
- never treat a bare inbound `YES` as login approval; require the signed challenge and number/device match to prevent reply spoofing and approval fatigue
- account recovery and device-loss flows

### Native notifications
- Apple Push Notification Service (APNs)
- Firebase Cloud Messaging (FCM) for Android
- device-level notification preferences
- actionable notifications such as Accept Ride, Approve Student Ride, Driver Arriving, and I Need Help
- push token lifecycle / invalid-token cleanup
- SMS/RCS remains the critical fallback rather than the primary routine channel

### Safety / emergency experience
- prominent native Emergency Assist entry point during active rides
- direct device Call 911 action; BandWagon does not represent itself as an emergency dispatch service
- one-touch guardian / safety-circle alert
- optional user-initiated live location sharing during a safety event or active ride, subject to explicit privacy controls
- native location permission model with clear foreground / background distinctions
- no passive background tracking by default
- native share sheet for ride / safety details when appropriate

### Ride experience
- native driver / rider active-ride screen
- arrival / pickup / drop-off actions
- native camera QR scanning for Verified Pickup Handshake
- optional NFC / proximity-assisted handshake investigation, while preserving QR + phrase fallback
- maps / navigation handoff to Apple Maps, Google Maps, or preferred installed mapping app
- calendar add / open actions
- camera integration for driver credential capture
- photo/document upload with on-device cropping / compression before private S3 upload
- offline / poor-connectivity handling for currently active ride details and queued non-critical updates

### Mobile UX
- fast household / organization switcher
- large, simple active-ride controls
- accessibility / Dynamic Type / VoiceOver / TalkBack
- dark mode
- haptics only where useful, particularly safety and ride-state confirmations
- tablet support where reasonable, especially for administrators

### Privacy / platform requirements
- Apple App Privacy disclosures
- Google Play Data Safety disclosures
- age rating / child-safety review
- COPPA/privacy counsel review before store submission because minors are central to the product
- clear permission explanations for location, notifications, camera, photos, and biometrics
- minimize mobile analytics / advertising SDKs; BandWagon does not need ad-tech tracking
- no sensitive documents in crash reports, analytics events, push payloads, screenshots, or logs
- App Store / Play Store privacy-policy and account-deletion requirements

### App distribution / operations
- Apple Developer Program and App Store Connect
- Google Play Console
- TestFlight beta channel
- Google Play internal / closed testing
- staged rollouts and remote feature flags
- native crash / performance monitoring with sensitive-data scrubbing
- CI/CD for signed iOS / Android builds
- release compatibility policy between mobile app versions and BandWagon API versions
- minimum supported OS policy

### Product opportunities enabled by native
- richer actionable push notifications
- home-screen widgets for next ride / upcoming event
- Live Activities / Dynamic Island on supported iPhones for an active ride, if privacy review supports it
- Android equivalent ongoing ride notification
- native QR organization join / event check-in
- faster Verified Pickup Handshake using native camera and possibly proximity assistance
- easier camera-based document capture
- improved Emergency Assist UX
- optional CarPlay / Android Auto investigation only if it can be done safely and within platform rules

### Native admin scope
The initial native apps should prioritize parents, students, and drivers. Complex organization administration can remain web-first unless real usage shows a clear need for native admin screens.

**Exit:** A user can install BandWagon from the Apple App Store or Google Play, sign in, switch organizations, manage household rides, receive native notifications, complete an active ride, use Emergency Assist, complete the Verified Pickup Handshake, and upload driver credentials while all authoritative rules remain server-side.

---

## Post-v2 Candidates

- home-screen widgets / Live Activities expansion
- richer organization analytics
- route / demand forecasting
- AI admin copilot expansion
- QR event check-in / attendance integrations
- school / district roster integrations where legally and contractually appropriate
- broader SSO / identity integrations
- optional white-label / organization-branded mobile experience only if demand justifies the operational cost
- CarPlay / Android Auto only after safety and platform-policy review

---

## Release Sequence

```text
0.13  Safety & Trust
  |
0.14  Operations & Engagement
  |
0.15  SaaS / Privacy / Production Candidate
  |
1.0   FloMoGo Production / General Availability
  |
2.0   Native iOS / Android Apps
```

The priority through v1 is finishing product workflows and operational controls rather than adding speculative features. Native application work begins after v1 so it is built on a stable API and product contract instead of duplicating unfinished product logic.
