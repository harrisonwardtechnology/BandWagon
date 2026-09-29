# Email On bandwagon.club

Current setup as of September 2026.

## Who Does What

| Piece | Job |
| --- | --- |
| **Proofpoint Essentials** | Receives all inbound mail (MX), filters it, then hands it to Microsoft 365 |
| **Microsoft 365** | Hosts the shared mailboxes and people inboxes |
| **SMTP2GO** | Sends the app's own email (sign-in codes, ride notices, invites) |
| **Cloudflare** | DNS, DNSSEC, and the MTA-STS policy Worker |

## Shared Mailboxes (No License Needed)

| Address | Used For |
| --- | --- |
| support@bandwagon.club | Help, `SUPPORT_EMAIL`, VAPID push contact, RCS and Google contact |
| privacy@bandwagon.club | Privacy and student data requests, `PRIVACY_EMAIL` |
| security@bandwagon.club | Security reports, `SECURITY_EMAIL`, `security.txt` |
| sponsors@bandwagon.club | Sponsor questions |
| hello@bandwagon.club | General contact |
| noreply@bandwagon.club | `EMAIL_FROM` for app email, so bounces land somewhere |

`tls-reports@bandwagon.club` is an alias that receives TLS-RPT reports.

**Gotcha:** creating a shared mailbox can fail with a proxy address collision when the same name already exists on another domain in the tenant (like harrisonward.com). Give it a unique alias such as `bw-support` and set the primary address to `support@bandwagon.club`.

## DNS Records (Live)

| Type | Name | Value |
| --- | --- | --- |
| MX | @ | `mx1-us1.ppe-hosted.com` (10), `mx2-us1.ppe-hosted.com` (20) |
| TXT | @ | `v=spf1 include:_spf-us.ppe-hosted.com include:spf.protection.outlook.com include:spf.smtp2go.com -all` |
| TXT | @ | `MS=ms…` (M365 domain verification) |
| CNAME | autodiscover | `autodiscover.outlook.com` |
| CNAME | selector1._domainkey, selector2._domainkey | M365 DKIM (from the Defender DKIM page) |
| CNAME / TXT | SMTP2GO DKIM and return path | From the SMTP2GO sender domain page |
| TXT | Proofpoint DKIM selector | From Proofpoint Essentials outbound settings |
| TXT | _dmarc | `v=DMARC1; p=reject; rua=mailto:…` (reports go to Cloudflare DMARC Management) |
| TXT | _mta-sts | `v=STSv1; id=2026092802` |
| TXT | _smtp._tls | `v=TLSRPTv1; rua=mailto:tls-reports@bandwagon.club` |
| TXT | default._bimi | `v=BIMI1; l=https://bandwagon.club/brand/bimi.svg` |

DNSSEC is on in Cloudflare, and the DS record is at the registrar.

## MTA-STS Policy

Served by the Cloudflare Worker `mta-sts-bandwagon` at `https://mta-sts.bandwagon.club/.well-known/mta-sts.txt`:

```text
version: STSv1
mode: enforce
mx: mx1-us1.ppe-hosted.com
mx: mx2-us1.ppe-hosted.com
max_age: 604800
```

**Any time the policy changes, bump the `id` in the `_mta-sts` TXT record** (for example `2026092803`), or senders keep the old one cached.

## BIMI Logo

- File: `apps/web/public/brand/bimi.svg` (SVG Tiny PS, square, solid background)
- Plain circles, rect, path and ellipse only. No dashed strokes, scripts or external links.
- Yahoo, AOL and Fastmail show it for free. Gmail and Apple Mail need a paid VMC or CMC certificate.
- Inboxes cache the logo for days after a change.

## App Settings (Coolify)

- `SUPPORT_EMAIL=support@bandwagon.club`
- `SECURITY_EMAIL=security@bandwagon.club`
- `PRIVACY_EMAIL=privacy@bandwagon.club` (optional; the privacy pages use the built-in `PRIVACY_EMAIL_FALLBACK` today)
- `EMAIL_FROM="BandWagon <noreply@bandwagon.club>"`
- `VAPID_SUBJECT=mailto:support@bandwagon.club`
- `PLATFORM_OWNER_EMAIL` stays your own address

## Changing Mail Providers Later

1. Update MX and SPF.
2. Update the `mx:` lines in the MTA-STS Worker, then bump the `_mta-sts` id.
3. Watch TLS-RPT and DMARC reports for a week.

## Later: App Inbox

If the app ever needs to read incoming mail (like the HF Tracker receipt inbox), use a subdomain such as `in.bandwagon.club` with Cloudflare Email Routing and a Worker, so the main domain stays on Proofpoint and M365.
