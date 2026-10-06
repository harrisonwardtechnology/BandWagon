# Contributing to BandWagon

Thank you for helping improve BandWagon.

- Do not include real rider, driver, household, address, phone, email, calendar or message data in code, tests, screenshots or issues.
- Never commit secrets or `.env` files.
- Preserve tenant isolation and privacy filtering in every API change.
- Add tests for authorization and cross-organization access when adding data access paths.
- Do not add live GPS tracking, public ratings/rankings or hidden contact disclosure without an explicit product/privacy decision.
- Security issues belong in the private security-reporting channel, not a public issue.
- When a change affects what people see or do, add a plain-language entry to `apps/web/src/lib/whats-new.ts` (the `/whats-new` page) and a technical entry to `CHANGELOG.md`. Then run `npm run demo:sync`, and update the demo walkthrough in `demo/` if the change is something people would see.
