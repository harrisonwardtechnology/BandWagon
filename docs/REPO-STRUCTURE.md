# Repo Structure

Where things live in the BandWagon repo, as of September 2026.

```text
BandWagon/
├── apps/web/                          # The production app (Next.js 15, React 19, TypeScript)
│   ├── src/app/                       # Pages and API routes (App Router)
│   │   ├── api/                       # JSON APIs, webhooks (Twilio, Stripe, DoDomain), cron
│   │   ├── app/                       # Signed-in member area
│   │   ├── admin/                     # Organization and platform admin screens
│   │   ├── login/  start/  help/      # Sign-in, community sign-up, help and ideas
│   │   ├── sms-opt-in/  privacy/  terms/  cookies/  legal/
│   │   ├── opengraph-image.tsx        # Share card (uses components/og-card.tsx)
│   │   ├── robots.ts  sitemap.ts      # Search engine rules
│   │   └── layout.tsx                 # Icons, metadata, fonts
│   ├── src/lib/                       # Business logic: rides, households, SMS, auth, tenants (125 files)
│   ├── src/components/                # Shared UI, brand logo, share card
│   ├── src/middleware.ts              # Legacy host redirects, robots headers, support mode
│   ├── database/migrations/           # 62 numbered SQL migrations (001 to 062)
│   ├── tests/                         # 41 unit and guard test files (node:test)
│   ├── e2e/                           # Playwright specs (privacy consent, ride workflow)
│   ├── scripts/                       # Migrate, verify schema, smoke tests, key rotation,
│   │                                  # backup restore check, tenant domain move
│   ├── public/                        # Icons, logos, brand files, security.txt, sw.js
│   │   ├── icons/                     # PWA and Apple icons
│   │   ├── brand/                     # BIMI, Google sign-in logo, RCS logo and banner
│   │   └── social/                    # README and social preview image
│   ├── next.config.ts                 # Security and cache headers
│   └── Dockerfile
├── demo/                              # demo.bandwagon.club: static fake-data walkthrough
│   ├── index.html  app.js  styles.css
│   ├── sw.js  manifest.webmanifest  icons/
│   ├── nginx.conf                     # Caching, gzip and security headers
│   └── Dockerfile                     # Stamps a content hash into asset URLs at build
├── docs/                              # All documentation (start at docs/README.md)
│   ├── operations/                    # Runbooks: email, SMS/RCS, domains, HA, backups
│   ├── releases/                      # Release notes per version
│   ├── architecture/  business/  notes/
│   └── archive/                       # Old setup notes, not current
├── config/                            # Example config, LiteLLM config, status page CSS
├── .github/workflows/                 # web-build.yml (CI), production-synthetic.yml (hourly)
├── docker-compose.coolify.example.yml # Single-server Coolify stack
├── docker-compose.coolify.ha.yml      # High availability: migrate, 2 web, 2 workers
├── docker-compose.coolify.staging.yml # Staging stack
├── BandWagon-GitHub-Social-Preview.png # Upload in GitHub repo Settings > Social Preview
├── CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  README.md
└── BandWagon_FloMoGo_Master_Specification.docx
```

## Rules Of Thumb

- New app code goes in `apps/web/src`. Keep business rules in `src/lib`, not in pages.
- Every schema change is a new numbered file in `database/migrations`. Never edit an old one.
- Every feature gets tests in `apps/web/tests`. CI must pass before merge.
- The `demo/` site never calls production APIs and uses fake data only.
- New docs go in `docs/` and get a line in [docs/README.md](README.md).
