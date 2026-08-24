# BandWagon

**BandWagon** is a privacy-first, open-source community carpool coordination platform developed and maintained by **Harrison Ward Technology**.

**FloMoGo** is the first community service powered by BandWagon, serving the Flower Mound band community.

- Platform home: `https://bandwagon.harrisonward.net`
- FloMoGo: `https://flomogo.app`
- Tagline: **Hop on the BandWagon.**

BandWagon connects people who voluntarily coordinate rides. It does not provide transportation, dispatch or certify drivers, supervise rides, or track vehicles. Participating organizations are not automatically affiliated with, sponsors of, endorsers of, or operators of the platform.

## Documentation

- `docs/ORGANIZATION-SETUP.md` - create and configure an organization
- `docs/PARENT-STUDENT-GUIDE.md` - household and rider instructions
- `docs/DRIVER-GUIDE.md` - driver instructions
- `docs/PWA-INSTALL.md` - install on iPhone/iPad and Android
- `docs/CUSTOM-DOMAINS.md` - custom organization domains
- `docs/BRANDING.md` - BandWagon/FloMoGo branding model
- `docs/COOLIFY.md` - Coolify deployment
- `docs/GITHUB-DEPLOY.md` - GitHub to Coolify launch checklist
- `docs/SECURITY-DEPLOYMENT.md` - production security guidance
- `docs/operations/V1-LAUNCH-CHECKLIST.md` - authoritative v1 go/no-go checklist
- `docs/releases/1.0.0-rc1.md` - current v1 release-candidate scope and blockers

Before a FloMoGo production release, run `npm run release:check-env:flomogo` from `apps/web`. The checker reports missing controls without printing configured secret values.

## Demo

The `demo/` directory is a fake-data-only interactive walkthrough. It does not call production APIs or create real rides.
