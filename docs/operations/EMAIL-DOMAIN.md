# Email On bandwagon.club

## Who Does What

- **Microsoft 365** receives all mail for bandwagon.club (MX) and hosts the people inboxes.
- **SMTP2GO** sends the app's own email (sign-in codes, ride notices, invites).
- **Cloudflare** holds the DNS, MTA-STS worker, and DNSSEC.

## Shared Mailboxes (No License Needed)

| Address | Used For |
| --- | --- |
| support@bandwagon.club | Help, `SUPPORT_EMAIL`, VAPID push contact |
| privacy@bandwagon.club | Privacy and student-data requests |
| security@bandwagon.club | Security reports, `SECURITY_EMAIL`, security.txt |
| sponsors@bandwagon.club | Sponsor questions |
| hello@bandwagon.club | General contact |
| noreply@bandwagon.club | `EMAIL_FROM` for app email (alias or mailbox so bounces land somewhere) |

## DNS Records

| Type | Name | Value |
| --- | --- | --- |
| TXT | @ | `MS=ms…` (M365 verification, from the admin center) |
| MX | @ | `bandwagon-club.mail.protection.outlook.com` (exact value from M365) priority 0 |
| TXT | @ | `v=spf1 include:spf.protection.outlook.com include:spf.smtp2go.com -all` |
| CNAME | autodiscover | `autodiscover.outlook.com` |
| CNAME | selector1._domainkey / selector2._domainkey | from M365 DKIM page |
| CNAME | SMTP2GO DKIM + return-path | from SMTP2GO sender domain page |
| TXT | _dmarc | `v=DMARC1; p=reject; rua=mailto:…; ruf=mailto:…; fo=1` (start at `p=quarantine` for a week if unsure) |
| TXT | _mta-sts | `v=STSv1; id=<date>` |
| TXT | _smtp._tls | `v=TLSRPTv1; rua=mailto:…` |
| CNAME/Worker | mta-sts | Cloudflare Worker serving the policy (`mode: enforce`, `mx: *.mail.protection.outlook.com`) |
| TXT | default._bimi | optional, needs a square SVG Tiny PS logo |

Turn on DNSSEC in Cloudflare and add the DS record at the registrar.

## App Settings (Coolify)

- `SUPPORT_EMAIL=support@bandwagon.club`
- `SECURITY_EMAIL=security@bandwagon.club`
- `PLATFORM_OWNER_EMAIL` stays your own address
- `EMAIL_FROM="BandWagon <noreply@bandwagon.club>"` once the SMTP2GO sender domain is verified
- `VAPID_SUBJECT=mailto:support@bandwagon.club`

## Later: App Inbox

If the app ever needs to read incoming mail (like the HF Tracker receipt inbox), use a subdomain such as `in.bandwagon.club` with Cloudflare Email Routing and a Worker, so M365 keeps the main domain.
