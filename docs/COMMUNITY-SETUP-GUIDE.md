# BandWagon Community Setup Guide

This guide is written for a non-technical community organizer. You should not need to understand servers, APIs, DNS, databases, or Cloudflare to complete normal setup.

## 1. Create the Community

1. Enter the community name.
2. Choose the short BandWagon name/slug shown in the preview.
3. Confirm the primary organization admin.
4. Click **Create Community**.

BandWagon automatically creates the organization, its platform hostname, the platform domain record, monitoring-registration record, audit record, and default safety/privacy configuration.

Example: a community with slug `flomogo` receives `https://flomogo.harrisonward.org`.

## 2. Complete the Organization Profile

Enter the public organization name and optional logo/branding. Add the primary operational admin, privacy contact, safety escalation contact and finance/funding owner where appropriate. One person may initially fill more than one role, but the ownership should be explicit.

## 3. Review the Approval / Governance Checklist

BandWagon supplies a proposal and evidence package. It is not an approval form. Each organization should use its own normal process and attach its official decision, minutes, memo, email, ticket, agreement or conditions.

Before inviting real families, confirm:

- participation is voluntary;
- the organization has identified who may administer members and drivers;
- any school/program approval required locally is documented;
- any volunteer, background, license or insurance requirements are defined by the organization;
- privacy and safety escalation contacts are named;
- optional AI, contributions, sponsor recognition, SMS/RCS, calendar and other modules are deliberately enabled or disabled.

## 4. Choose Features

BandWagon optional modules are organization-specific. Turning a feature off must also stop new feature-specific provider calls and new feature-specific data collection.

Core privacy/security controls are not optional: tenant isolation, guardian authority, role-based access, least privilege, encryption, exact-location disclosure gates, audit logging, incident handling, privacy requests and retention/deletion boundaries.

## 5. Invite Members

Choose the organization join method, create a join code if desired, and send the normal BandWagon invitation. Do not upload a school roster unless a separate approved integration exists.

Parents create and manage their own households. Student participation remains subject to guardian controls.

## 6. Configure Drivers

Decide which organization-specific driver requirements apply. BandWagon does not independently certify or endorse drivers. The organization defines the required approval process and BandWagon records the resulting status.

Recommended setup questions:

1. Who may drive?
2. Is volunteer/background approval required?
3. Is license or insurance review required?
4. Who is authorized to approve driver status?
5. How often does approval expire?
6. Is Verified Pickup optional, recommended or required?

## 7. Use the Free BandWagon Address

Nothing else is required for the default BandWagon hostname. The community is routed through the platform wildcard automatically.

## 8. Optional: Add Your Own Domain

Examples: `flomogo.app` or `rides.example.org`.

1. In Organization Settings choose **Custom Domain**.
2. Enter the exact domain you want to use.
3. BandWagon creates the Cloudflare custom-hostname request and displays the DNS record you need.
4. Sign in to the company where your domain's DNS is managed. If you do not know where that is, stop and ask the person who manages your website/domain.
5. Click **Add Record**.
6. Copy the **Type**, **Name/Host** and **Target/Value** exactly from BandWagon.
7. Save the DNS record.
8. Return to BandWagon and click **Check Again**.
9. BandWagon verifies DNS and TLS. When both are ready, the domain changes to **Active**.
10. Optionally choose **Make Primary**.

Do not delete existing website/email DNS records unless BandWagon explicitly tells you to. If the DNS provider reports a conflict, contact support rather than guessing.

## 9. Confirm Monitoring

New communities are automatically queued for monitoring. BandWagon waits until the community hostname is healthy before publishing it on the public status page. A monitoring failure does not block community creation; Platform Health shows pending/failed registration for retry.

## 10. Test Before Launch

Create test parent, student and driver accounts and complete at least one full test ride. Test ride request, offer, guardian approval, exact-address disclosure, pickup verification, cancellation/no-show, notification delivery, STOP/HELP, account export/deletion and support escalation.

## 11. Invite Real Families

Only after the organization has closed its required approval/setup conditions should it broadly invite real users.
