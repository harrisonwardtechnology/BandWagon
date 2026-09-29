# BandWagon Docs

Every BandWagon doc, grouped by who it's for. Start with the section that fits you.

## For Families, Students And Drivers

- [User Guide](USER-GUIDE.md): the basics of using BandWagon
- [Parent And Student Guide](PARENT-STUDENT-GUIDE.md): households, managed students, consent
- [Driver Guide](DRIVER-GUIDE.md): offering rides, eligibility, pickup checks
- [Install The App](PWA-INSTALL.md): add BandWagon to your phone's home screen
- [Passkeys](PASSKEYS.md): sign in with Face ID, fingerprint or a security key
- [Location Privacy](LOCATION-PRIVACY.md): what location data is (and isn't) used

## For Organization Admins

- [Community Setup Guide](COMMUNITY-SETUP-GUIDE.md): start a community step by step
- [Organization Setup](ORGANIZATION-SETUP.md) and [Organization Onboarding](ORGANIZATION-ONBOARDING.md)
- [Organization Review Guide](ORGANIZATION-REVIEW-GUIDE.md): how new communities get approved
- [Events](EVENTS.md) and [Event Proposals](EVENT-PROPOSALS.md): create, sync and suggest events
- [Ride Workflow](RIDE-WORKFLOW.md) and [Waitlists](WAITLISTS.md): requests, offers, matches and full rides
- [Accounts And Households](ACCOUNTS-HOUSEHOLDS.md) and [Trusted Household Members](HOUSEHOLD-DELEGATES.md)
- [Custom Domains](CUSTOM-DOMAINS.md): use your own web address
- [Branding](BRANDING.md): logos, colors and per-community branding
- [Feature Requests](FEATURE-REQUESTS.md): how ideas are collected and reviewed
- [Fair Use And Sponsors](operations/ORG-FAIR-USE-AND-SPONSORS.md)

## How It Works

- [SaaS Tenant Model](SAAS-TENANTS.md): how communities are kept separate
- [Notification Routing](NOTIFICATION-ROUTING.md): push, email, SMS and RCS choices
- [Messaging Abuse Controls](MESSAGING-ABUSE-CONTROLS.md)
- [AI Gateway](architecture/AI-GATEWAY.md) and [AI Governance](operations/AI-GOVERNANCE.md)
- [Test Automation](TEST_AUTOMATION.md): what the tests cover and how CI runs them
- [Repo Structure](REPO-STRUCTURE.md): where things live in this repo

## Running BandWagon (Operations)

### Deploy

- [Coolify Deployment](COOLIFY.md) and [GitHub To Coolify Checklist](GITHUB-DEPLOY.md)
- [High Availability](operations/HIGH-AVAILABILITY.md)
- [Staging](operations/STAGING.md)
- [Security And Deployment Rules](SECURITY-DEPLOYMENT.md)
- [Demo Site](operations/DEMO-SITE.md): demo.bandwagon.club, caching and deploys

### Domains, Email And Messaging

- [Move To bandwagon.club](operations/MOVE-TO-BANDWAGON-CLUB.md) and [Changing Tenant Domains](operations/CHANGING-TENANT-DOMAIN.md)
- [Email On bandwagon.club](operations/EMAIL-DOMAIN.md): Proofpoint, Microsoft 365, SMTP2GO, MTA-STS, BIMI
- [SMS And RCS](operations/SMS-AND-RCS.md): consent, welcome and HELP texts, STOP/START, Twilio RCS sender
- [Google OAuth Verification](operations/GOOGLE-OAUTH-VERIFICATION.md): Google Calendar app review
- [SEO](operations/SEO.md): sitemap, search engines, crawler rules

### Keep It Healthy

- [Uptime Kuma Playbook](operations/UPTIME-KUMA-PLAYBOOK.md) and the public [status page](https://status.bandwagon.club/)
- [Error Monitoring](operations/ERROR-MONITORING.md): GlitchTip
- [Backup And Restore Verification](operations/BACKUP-RESTORE-VERIFICATION.md)
- [Key Rotation](operations/KEY-ROTATION.md)
- [Accessibility, PWA And Performance](operations/ACCESSIBILITY-PWA-PERFORMANCE.md)
- [Known Issues](KNOWN-ISSUES.md): gaps found during the docs review

## Plans And Releases

- [V1 Launch Checklist](operations/V1-LAUNCH-CHECKLIST.md): what's done and what's left
- [Roadmap Through v2](ROADMAP-TO-V1.md) and [v2 Sprint Map](V2-ROADMAP-AND-SPRINT-MAP.md)
- [Changelog](../CHANGELOG.md) and [release notes](releases/)
- [Competitor Analysis](business/COMPETITOR-ANALYSIS.md), [Insurance And Legal Brief](business/INSURANCE-AND-LEGAL-BRIEF.md), [Sponsorship Impact Model](notes/sponsorship-impact-model.md)
- [Archive](archive/README.md): old setup notes, not current

## Writing Docs

- Plain English, short sentences, short bullets.
- Title Case for every heading.
- No em dashes.
- Never put real names, phone numbers, addresses, secrets or keys in docs or screenshots.
- Add every new doc to this index.
