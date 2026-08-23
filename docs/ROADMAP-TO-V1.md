# BandWagon Roadmap To v1

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

**Exit:** A normal parent can join, add family, request/offer/complete a ride and receive the correct reminders without admin assistance.

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
- Microsoft Calendar integration
- Google / Microsoft sync controls per organization
- duplicate / conflict handling

### Privacy / family controls
- user data export
- right-to-be-forgotten workflow
- document deletion / retention lifecycle
- guardian consent management
- student account / household management polish
- organization privacy / terms acknowledgement
- exact-location retention cleanup

### Security / reliability
- stronger auth/IP throttling
- account-enumeration hardening
- session / cookie hardening review
- admin audit export
- secret / key rotation procedure
- backup / restore verification
- centralized error / health monitoring
- accessibility and keyboard review
- mobile/PWA install and offline-state polish
- performance / load testing

### AI governance
- LiteLLM production virtual keys / budgets
- prompt/body logging disabled for sensitive workflows
- provider retention configuration review
- AI cost alerts
- AI failure / fallback behavior

**Exit:** A second organization can be onboarded without code changes; privacy deletion/export and disaster recovery are tested; production security checklist is complete.

---

## 1.0 - FloMoGo Production + General Availability
**Goal:** Ship the first production tenant and freeze the v1 contract.

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

### Release validation
- end-to-end regression test
- tenant isolation test
- household / multi-org test
- credential / eligibility test
- emergency notification test
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

## Release Sequence

```text
0.13  Safety & Trust
  |
0.14  Operations & Engagement
  |
0.15  SaaS / Privacy / Production Candidate
  |
1.0   FloMoGo Production / General Availability
```

The priority from here is finishing product workflows and operational controls rather than adding speculative features. New ideas can be parked for post-v1 unless they are required for safety, privacy, tenant isolation, or launch readiness.
