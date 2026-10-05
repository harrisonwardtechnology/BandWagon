# Keeping The Demo Current

demo.bandwagon.club is a hand-built walkthrough with fake data (`demo/`). It is its own Coolify app, so it doesn't change when the main site deploys. Three things keep it current:

1. **Automatic deploy.** `.github/workflows/deploy-demo.yml` asks Coolify to redeploy the demo on every merge to `main` that touches `demo/` or What's New. It's fake data only, so this is safe to automate.
2. **What's New stays in sync.** The demo's What's New panel reads `demo/whats-new.json`, copied from `apps/web/src/lib/whats-new.ts` by `npm run demo:sync`. `tests/demo-sync.test.ts` fails the build if they differ.
3. **Reminder on screen changes.** When a pull request changes screens in `apps/web/src/app` or `src/components` but not `demo/`, the Web Build check leaves a warning. If families or organizers would notice the change, update the demo walkthrough in the same PR.

## One-Time Setup

1. In Coolify, go to **Settings** and turn on the **API**.
2. Go to **Keys & Tokens**, then **API Tokens**. Create a token named `GitHub Demo Deploy` with only the **deploy** permission.
3. In GitHub, go to BandWagon → **Settings** → **Secrets and variables** → **Actions**. Add a secret named `COOLIFY_DEPLOY_TOKEN` and paste the token. Don't put it anywhere else.
4. On the **Variables** tab, add `COOLIFY_URL` = `https://my.harrisonward.net` and `COOLIFY_DEMO_APP_UUID` = `spd4jmodbr4upnrqlxsmuu6w` (the BandWagon (Demo) app). These aren't secret.
5. Run **Actions → Deploy Demo → Run workflow** once to test.

Until the secret exists, the workflow skips with a notice instead of failing.

## Security

- The token can only deploy. It can't read environment variables or change settings.
- It lives only in GitHub's encrypted secrets.
- Rotate it in Coolify if it is ever exposed, then update the GitHub secret.
