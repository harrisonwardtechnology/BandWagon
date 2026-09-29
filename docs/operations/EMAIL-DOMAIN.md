# Email On bandwagon.club

## Who Does What

- **Proofpoint Essentials** receives all inbound mail for bandwagon.club (MX), filters it, and relays it to Microsoft 365.
- **Microsoft 365** hosts the mailboxes and sends mail from people and shared mailboxes.
- **SMTP2GO** sends the app's own email (sign-in codes, ride notices, invites).
- **Cloudflare** holds DNS, DNSSEC, DMARC reporting, and the MTA-STS policy Worker.

Mail flow: sender > Proofpoint (`mx1-us1` / `mx2-us1.ppe-hosted.com`) > Microsoft 365 mailbox.

## DNS Records

| Type | Name | Value |
| --- | --- | --- |
| MX | @ | `mx1-us1.ppe-hosted.com` priority 10 |
| MX | @ | `mx2-us1.ppe-hosted.com` priority 20 |
| TXT | @ | `v=spf1 include:_spf-us.ppe-hosted.com include:spf.protection.outlook.com include:spf.smtp2go.com -all` |
| TXT | @ | `MS=ms…` (M365 domain verification, from the admin center) |
| CNAME | autodiscover | `autodiscover.outlook.com` |
| CNAME | selector1._domainkey | from the M365 DKIM page |
| CNAME | selector2._domainkey | from the M365 DKIM page |
| CNAME | SMTP2GO DKIM and return-path | from the SMTP2GO sender domain page |
| TXT | Proofpoint DKIM selector | from the Proofpoint Essentials console |
| TXT | _dmarc | `v=DMARC1; p=reject; rua=mailto:<id>@dmarc-reports.cloudflare.net` |
| TXT | _mta-sts | `v=STSv1; id=<yyyymmddNN>` |
| TXT | _smtp._tls | `v=TLSRPTv1; rua=mailto:tls-reports@bandwagon.club` |
| TXT | default._bimi | `v=BIMI1; l=https://bandwagon.club/brand/bimi.svg;` |

The DMARC report address comes from Cloudflare DMARC Management. Copy it from the Cloudflare dashboard. Do not guess it.

## DKIM

Three senders sign mail, each with its own key:

- **Microsoft 365**: `selector1` and `selector2`. Turn signing on in the Defender portal after the CNAMEs resolve.
- **SMTP2GO**: the DKIM CNAME from the sender domain page. App email must pass this.
- **Proofpoint Essentials**: its own selector, for mail Proofpoint signs.

## DMARC

- Policy is `p=reject`. Mail that fails both SPF and DKIM alignment is rejected.
- Aggregate reports go to Cloudflare DMARC Management. Check it after adding any new sender.
- Before adding a new service that sends as @bandwagon.club, add it to SPF or give it DKIM first. Otherwise its mail is rejected.

## MTA-STS

Tells other mail servers to only deliver to our MX over TLS.

- TXT `_mta-sts`: `v=STSv1; id=<yyyymmddNN>`
- Policy is served by the Cloudflare Worker `mta-sts-bandwagon` at https://mta-sts.bandwagon.club/.well-known/mta-sts.txt

Policy file:

```
version: STSv1
mode: enforce
mx: mx1-us1.ppe-hosted.com
mx: mx2-us1.ppe-hosted.com
max_age: 604800
```

**Bump the `id` whenever the policy changes** (for example `2026092801` to `2026092802`). Senders only re-fetch the policy when the id changes.

If the MX hosts ever change, update the Worker policy and bump the id at the same time. A stale policy with `mode: enforce` blocks inbound mail.

## TLS-RPT

- TXT `_smtp._tls`: reports go to tls-reports@bandwagon.club.
- tls-reports@ is an alias, not a mailbox.
- Reports show senders that failed to connect over TLS. Check them after any MX or MTA-STS change.

## BIMI

- TXT `default._bimi` points to https://bandwagon.club/brand/bimi.svg.
- The file is SVG Tiny PS, the route logo on navy. See [BRANDING.md](../BRANDING.md).
- BIMI needs DMARC at `p=quarantine` or `p=reject`. We have `p=reject`.
- **Gmail** only shows the logo with a VMC or CMC certificate. We do not have one yet.
- **Yahoo, AOL, and Fastmail** show it without a certificate.
- If the logo changes, replace `bimi.svg` and purge Cloudflare cache for `/brand/*`.

## DNSSEC

DNSSEC is on in Cloudflare. The DS record is set at the registrar. If the domain ever moves registrar or DNS host, turn DNSSEC off first, wait for the DS to expire, then move.

## Shared Mailboxes (No License Needed)

| Address | Used For |
| --- | --- |
| support@bandwagon.club | Help, `SUPPORT_EMAIL`, VAPID push contact, Twilio and Google support email |
| privacy@bandwagon.club | Privacy and student-data requests |
| security@bandwagon.club | Security reports, `SECURITY_EMAIL`, security.txt |
| sponsors@bandwagon.club | Sponsor questions |
| hello@bandwagon.club | General contact |
| noreply@bandwagon.club | `EMAIL_FROM` for app email, so bounces land somewhere |

**Tip:** Creating a shared mailbox in M365 can fail with a proxy address collision. This happens when another domain in the tenant already uses the same local part (like support@). Create the mailbox with a unique alias, like `bw-support`, then set the primary address to support@bandwagon.club.

## App Settings (Coolify)

App email is sent through SMTP2GO.

- `SUPPORT_EMAIL=support@bandwagon.club`
- `SECURITY_EMAIL=security@bandwagon.club`
- `EMAIL_FROM=noreply@bandwagon.club` (a display name like `BandWagon <noreply@bandwagon.club>` also works)
- `VAPID_SUBJECT=mailto:support@bandwagon.club`
- `PLATFORM_OWNER_EMAIL` stays your own address.

SMTP2GO credentials live in Coolify only. Never put them in the repo.

## Checks After Any Change

- Send a test from Gmail and Outlook.com to support@. Confirm it arrives.
- Send a sign-in code from the app. Check the headers show `spf=pass`, `dkim=pass`, `dmarc=pass`.
- Fetch https://mta-sts.bandwagon.club/.well-known/mta-sts.txt and confirm the MX lines match the MX records.
- Watch Cloudflare DMARC Management and TLS-RPT reports for a few days.

## Later: App Inbox

If the app ever needs to read incoming mail (like the HF Tracker receipt inbox), use a subdomain such as `in.bandwagon.club` with Cloudflare Email Routing and a Worker, so Proofpoint and M365 keep the main domain.
