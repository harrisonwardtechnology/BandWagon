# BandWagon

![BandWagon: Community-Powered Rides](apps/web/public/social/bandwagon-social.png)

<p align="center">
  <strong>Community-powered rides for families, schools, teams, and local organizations.</strong><br>
  Connect families. Save time. Build community.
</p>

<p align="center">
  <a href="https://bandwagon.club">Platform</a> ·
  <a href="https://flomogo.app">FloMoGo</a> ·
  <a href="https://demo.bandwagon.club/">Interactive demo</a> ·
  <a href="https://status.bandwagon.club/">Status</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="docs/ROADMAP-TO-V1.md">Roadmap</a> ·
  <a href="docs/operations/V1-LAUNCH-CHECKLIST.md">Launch checklist</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/harrisonwardtechnology/BandWagon/actions/workflows/web-build.yml"><img alt="Web Build" src="https://github.com/harrisonwardtechnology/BandWagon/actions/workflows/web-build.yml/badge.svg"></a>
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-0b172d?logo=nextdotjs">
  <img alt="PostgreSQL + PostGIS" src="https://img.shields.io/badge/PostgreSQL%20%2B%20PostGIS-17-336791?logo=postgresql&logoColor=white">
  <img alt="Privacy first" src="https://img.shields.io/badge/privacy-first-f0a500">
</p>

## Screenshots

Light or dark follows your GitHub theme, just like the app follows your device.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/home-desktop-dark.png"><img alt="Home Desktop" src="docs/assets/screenshots/home-desktop-light.png" width="820"></picture></p>

| Family Home | Rides | Admin Setup |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/family-home-desktop-dark.png"><img alt="Family Home Desktop" src="docs/assets/screenshots/family-home-desktop-light.png" width="280"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/rides-desktop-dark.png"><img alt="Rides Desktop" src="docs/assets/screenshots/rides-desktop-light.png" width="280"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/setup-desktop-dark.png"><img alt="Setup Desktop" src="docs/assets/screenshots/setup-desktop-light.png" width="280"></picture> |

| Sign In | What's New | Friendly 404 |
| --- | --- | --- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/sign-in-desktop-dark.png"><img alt="Sign In Desktop" src="docs/assets/screenshots/sign-in-desktop-light.png" width="280"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/whats-new-desktop-dark.png"><img alt="Whats New Desktop" src="docs/assets/screenshots/whats-new-desktop-light.png" width="280"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/not-found-desktop-dark.png"><img alt="Not Found Desktop" src="docs/assets/screenshots/not-found-desktop-light.png" width="280"></picture> |

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/family-home-phone-dark.png"><img alt="Family Home Phone" src="docs/assets/screenshots/family-home-phone-light.png" width="200"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/rides-phone-dark.png"><img alt="Rides Phone" src="docs/assets/screenshots/rides-phone-light.png" width="200"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/sign-in-phone-dark.png"><img alt="Sign In Phone" src="docs/assets/screenshots/sign-in-phone-light.png" width="200"></picture></p>

## What is BandWagon?

BandWagon is a privacy-first community carpool coordination platform developed and maintained by **Harrison Ward Technology**. It helps trusted groups organize events, coordinate ride requests and offers, match available seats, communicate important updates, and complete safer pickups—without becoming a public rideshare marketplace.

**FloMoGo** is the first community powered by BandWagon, serving the Flower Mound band community.

> **Hop on the BandWagon.**

## Try the interactive demo

Explore the complete fake-data walkthrough at **[demo.bandwagon.club](https://demo.bandwagon.club/)**. It demonstrates the BandWagon experience without connecting to production APIs, sending messages, or creating real rides.

## Built for real community coordination

| | Capability |
|---|---|
| 📅 | **Flexible events** — organizer-created events plus read-only Google and Microsoft calendar sync |
| 🚙 | **Ride coordination** — request, offer, match, pool, confirm, and complete community rides |
| 👨‍👩‍👧‍👦 | **Households and guardians** — family accounts, managed students, consent, and age-aware controls |
| 🛡️ | **Safety by design** — driver eligibility, credential review, emergency workflows, and verified pickup handshakes |
| 🔔 | **Useful notifications** — email, SMS/RCS, and web push with preference, abuse, and budget controls |
| 🏘️ | **Multi-organization** — tenant boundaries, organization policies, branding, domains, and admin tools |
| 🔐 | **Privacy operations** — encrypted sensitive data, retention controls, exports, deletion workflows, and audit trails |
| ♿ | **Accessible everywhere** — responsive web and installable PWA experiences built for phones and desktops |

## How it works

```text
Organization creates or syncs an event
                    ↓
      Families request or offer rides
                    ↓
       BandWagon proposes a safe match
                    ↓
     Participants review and confirm it
                    ↓
       Reminders + verified pickup flow
                    ↓
          Ride outcome is recorded
```

People remain in control throughout the workflow. Automated assistance can propose events or matches, but organization administrators and participants make the decisions.

## Project status

BandWagon is moving through its **v1 release-candidate and production-readiness phase**. The core application, database migrations, calendar integrations, scheduled operations, health monitoring, and automated test pipeline are in place. Final launch evidence and live pilot validation are tracked in the authoritative [v1 launch checklist](docs/operations/V1-LAUNCH-CHECKLIST.md).

- [Current v1 release-candidate scope](docs/releases/1.0.0-rc1.md)
- [Roadmap through v2](docs/ROADMAP-TO-V1.md)
- [Detailed v2 roadmap and sprint map](docs/V2-ROADMAP-AND-SPRINT-MAP.md)
- [Automated testing strategy](docs/TEST_AUTOMATION.md)

## Technology

- **Application:** Next.js 15, React 19, TypeScript
- **Data:** PostgreSQL 17, PostGIS, Redis
- **Storage:** private S3-compatible object storage
- **Integrations:** Google and Microsoft calendars, Google Routes, Twilio, SMTP, web push
- **Operations:** Docker, Coolify, GitHub Actions, health and synthetic monitoring

## Run it locally

The production application lives in `apps/web`.

```bash
cd apps/web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). PostgreSQL/PostGIS and Redis are required for the complete application; see the [deployment guide](docs/COOLIFY.md) and [`apps/web/README.md`](apps/web/README.md) for environment and infrastructure setup.

Before proposing a change, run the same core gates used by CI:

```bash
cd apps/web
npm run db:migrate
npm run db:verify
npm test
npm run typecheck
npm run build
```

## Repository map

```text
BandWagon/
├── apps/web/          # Production Next.js application, APIs, migrations, and tests
├── demo/              # Fake-data-only interactive product walkthrough
├── docs/              # Product, operations, security, deployment, and user guides
├── config/            # Environment schema and shared configuration references
└── .github/workflows/ # CI and production synthetic monitoring
```

The demo never calls production APIs, uses production credentials, sends real notifications, or creates real rides.

## Documentation

**Full index: [docs/README.md](docs/README.md)**

### Get started

- [User guide](docs/USER-GUIDE.md)
- [Organization setup](docs/ORGANIZATION-SETUP.md)
- [Parent and student guide](docs/PARENT-STUDENT-GUIDE.md)
- [Driver guide](docs/DRIVER-GUIDE.md)
- [Household delegates](docs/HOUSEHOLD-DELEGATES.md)
- [Waitlists](docs/WAITLISTS.md)
- [Events and calendars](docs/EVENTS.md) and [event proposals](docs/EVENT-PROPOSALS.md)
- [Passkeys](docs/PASSKEYS.md)
- [SMS consent and texts](docs/SMS-CONSENT-AND-TEXTS.md)
- [PWA installation](docs/PWA-INSTALL.md)

### Deploy and operate

- [Coolify deployment](docs/COOLIFY.md)
- [GitHub-to-Coolify launch guide](docs/GITHUB-DEPLOY.md)
- [V1 launch checklist and status](docs/operations/V1-LAUNCH-CHECKLIST.md)
- [Email domain (Proofpoint, M365, DMARC, MTA-STS, BIMI)](docs/operations/EMAIL-DOMAIN.md)
- [Cloudflare and caching](docs/operations/CLOUDFLARE-PERFORMANCE.md)
- [Google OAuth verification](docs/operations/GOOGLE-OAUTH-VERIFICATION.md)
- [Custom organization domains](docs/CUSTOM-DOMAINS.md)
- [Production security](docs/SECURITY-DEPLOYMENT.md)
- [Messaging abuse controls](docs/MESSAGING-ABUSE-CONTROLS.md)
- [Staging environment](docs/operations/STAGING.md)
- [Branding and logo files](docs/BRANDING.md)

Before a FloMoGo production release, run `npm run release:check-env:flomogo` from `apps/web`. The checker reports missing controls without printing secret values.

## Safety and privacy boundaries

BandWagon helps people who already belong to a community voluntarily coordinate rides. It does **not** provide transportation, dispatch or certify drivers, supervise rides, or track vehicles. Participating organizations are not automatically affiliated with, sponsors of, endorsers of, or operators of the platform.

Never place real rider, driver, household, address, phone, email, calendar, or message data in source code, tests, screenshots, or public issues. Review [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes and follow [SECURITY.md](SECURITY.md) for private vulnerability reporting.

---

<p align="center">
  Built with care by <strong>Harrison Ward Technology</strong>.<br>
  <strong>Fewer cars. Stronger bonds.</strong>
</p>
