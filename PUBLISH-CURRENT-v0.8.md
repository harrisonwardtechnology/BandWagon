# BandWagon Current Publish Pack v0.8

This is a consolidated repo overlay intended to bring the public GitHub repository up to the current BandWagon production state discussed and deployed.

## Included

Production application:
- Next.js / TypeScript PWA scaffold
- Dockerfile / Coolify deployment
- PostgreSQL/PostGIS and Redis health checks
- PWA manifest / service worker

Public trust/compliance:
- `/privacy`
- `/terms`
- `/messaging`
- `/sms-opt-in`
- Harrison Ward Technology operator branding
- Independent third-party / no organizational affiliation language
- Transportation-only coordination disclaimer
- SMS consent / STOP / HELP / carrier disclosure language

Twilio:
- `/api/webhooks/twilio/inbound`
- `/api/webhooks/twilio/status`
- `/api/webhooks/twilio/voice`
- `/api/webhooks/twilio/voice/status`
- Twilio webhook signature validation
- Redis idempotency
- Advanced Opt-Out state mirroring
- BandWagon voice greeting with 1-second lead-in and 2-second ending pause
- `/admin/messaging-test`
- `/api/admin/messaging-test`
- RCS-preferred + SMS-fallback test mode
- Forced SMS test mode

Configuration:
- Consolidated `apps/web/.env.example`
- Admin test environment variables
- Twilio variables
- Google/Microsoft calendar placeholders
- custom-domain/Coolify placeholders

Branding asset:
- `docs/assets/BandWagon-GitHub-Social-Preview.png`

## Public ride URL standard

Public/shareable ride URLs should use:

`https://bandwagon.harrisonward.net/r/K7M4X9QP`

The 8-character public reference should be random, uppercase, non-sequential, and exclude ambiguous characters where practical.

The production ride data/lookup workflow has not yet been implemented, so this pack does not create a fake `/r/[id]` ride handler.

## Publish

Extract this ZIP over the ROOT of the existing BandWagon repository.

Then from the repository root:

```bash
git status
git add apps docs
git commit -m "Bring BandWagon production app and integrations current"
git push origin main
```

If your current repository has older versions of the same files, allow these files to overwrite them.

## Coolify

After pushing:
1. Confirm Coolify detects `main`.
2. Redeploy BandWagon (Web).
3. Confirm `/api/health` returns `status: ok`.
4. Verify:
   - https://bandwagon.harrisonward.net/
   - https://bandwagon.harrisonward.net/privacy
   - https://bandwagon.harrisonward.net/terms
   - https://bandwagon.harrisonward.net/messaging
   - https://bandwagon.harrisonward.net/sms-opt-in
   - https://bandwagon.harrisonward.net/admin/messaging-test

## Do not commit secrets

Real values for these belong in Coolify runtime configuration only:
- DATABASE_URL
- REDIS_URL
- AUTH_SECRET
- DATA_ENCRYPTION_KEY
- SMTP_USER / SMTP_PASSWORD
- TWILIO_AUTH_TOKEN
- ADMIN_TEST_TOKEN
- Google/Microsoft OAuth secrets
- COOLIFY_API_TOKEN

## Current infrastructure state

The deployment design assumes:
- `bandwagon.harrisonward.net`
- Cloudflare Tunnel -> `http://localhost:80`
- Coolify proxy -> BandWagon container port 3000
- Coolify HTTP->HTTPS redirect disabled for this tunneled application
- PostgreSQL/PostGIS internal-only
- Redis internal-only
- SMTP2GO for email
- Twilio Messaging Service and (223) BANDWAG for messaging/voice
