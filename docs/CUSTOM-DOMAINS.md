# Organization Custom Domains

Every organization always has a canonical BandWagon URL such as:

`https://bandwagon.harrisonward.net/o/flomogo`

An organization may also use a verified custom hostname such as:

- `https://flomogo.app`
- `https://rides.example.org`

The hostname never selects an organization until BandWagon has verified ownership and explicitly activated it.

## Domain Lifecycle

1. Organization admin enters the requested hostname.
2. BandWagon normalizes the hostname and checks that it is not already claimed.
3. BandWagon creates a cryptographically random single-purpose verification token.
4. The admin is shown the TXT record to publish.
5. BandWagon checks authoritative/public DNS for the exact token.
6. After verification, BandWagon records `verified_at` and allows routing setup.
7. The admin points the hostname to the BandWagon deployment.
8. BandWagon verifies HTTP/TLS routing.
9. BandWagon activates the hostname and may make it the organization's primary URL.
10. Login, magic-link, OAuth and return URLs use only the platform hostname or verified organization hostnames.

## TXT Ownership Record

For `flomogo.app`, BandWagon should generate a record similar to:

```text
Type: TXT
Name: _bandwagon.flomogo.app
Value: bandwagon-verification=<random-token>
```

For a subdomain such as `rides.example.org`:

```text
Type: TXT
Name: _bandwagon.rides.example.org
Value: bandwagon-verification=<random-token>
```

The UI should show Copy buttons for both the name and value and make clear that some DNS providers expect only the relative host portion in the Name field.

## Verification Rules

- Use at least 128 bits of cryptographically secure randomness.
- Tokens are unique per organization + hostname + verification attempt.
- Store a token hash where practical; do not expose old verification tokens after success.
- Verification tokens expire, e.g. after 72 hours, and can be regenerated.
- Rate-limit manual `Check Again` requests.
- Background verification may recheck pending records periodically.
- Verification is case-sensitive for the token value even though hostnames are case-insensitive.
- Normalize IDNs to punycode before storing/routing.
- Remove a stale pending claim after a defined period.
- A hostname may belong to only one organization at a time.
- Removing and re-adding a hostname requires new verification.

## Routing DNS After Verification

Ownership verification and traffic routing are separate steps.

### Root/apex domain

For a root such as `flomogo.app`, use an `A`/`AAAA` record pointing to the BandWagon/Coolify server, or an ALIAS/ANAME/flattened CNAME if the DNS provider supports it.

### Subdomain

For a hostname such as `rides.example.org`, use either:

- `CNAME rides.example.org -> bandwagon.harrisonward.net`, when appropriate for the deployment; or
- an `A`/`AAAA` record to the BandWagon server.

Coolify's current DNS guidance supports pointing multiple domains to the same server IP, and Coolify can route multiple HTTPS domains to one application.

## Coolify Automation

BandWagon supports two modes:

### Manual mode

`CUSTOM_DOMAIN_AUTOMATION=manual`

After TXT verification, a Platform Admin adds the HTTPS hostname to the BandWagon application in Coolify and then clicks `Check Routing` in BandWagon.

### Coolify API mode

`CUSTOM_DOMAIN_AUTOMATION=coolify-api`

BandWagon (or a small operator-only domain worker) calls the Coolify API to update the application's comma-separated domain list. Coolify currently documents `PATCH /api/v1/applications/{uuid}` with a `domains` field and automatically configures HTTPS for domains entered with the `https://` protocol.

Recommended sequence:

1. TXT ownership VERIFIED.
2. Confirm hostname is unclaimed in BandWagon.
3. Retrieve the current approved BandWagon domain list.
4. Add `https://<hostname>` without removing existing domains.
5. PATCH the Coolify application.
6. Wait for proxy/certificate provisioning.
7. Verify `https://<hostname>/.well-known/bandwagon-domain` returns the expected organization/domain challenge.
8. Mark domain ACTIVE.

Do not use `force_domain_override=true` automatically. A Coolify domain conflict should fail closed and require operator review.

## Domain State Machine

```text
REQUESTED
  -> TXT_PENDING
  -> VERIFIED
  -> ROUTING_PENDING
  -> TLS_PENDING
  -> ACTIVE

Side states:
  VERIFICATION_EXPIRED
  ROUTING_ERROR
  SUSPENDED
  REMOVED
```

## Domain Database Model

```text
organization_domains
- id
- organization_id
- hostname
- normalized_hostname
- type              # canonical | custom
- status
- is_primary
- verification_token_hash
- verification_expires_at
- verified_at
- routing_verified_at
- tls_verified_at
- activated_at
- last_health_check_at
- last_error
- created_at
- removed_at
```

## Runtime Tenant Resolution

For every request:

1. Normalize and validate the Host header.
2. If host equals `bandwagon.harrisonward.net`, resolve organization from the `/o/<slug>` route when appropriate.
3. Otherwise look up `organization_domains.normalized_hostname` where `status=ACTIVE`.
4. If no ACTIVE match exists, return a neutral unknown-domain page. Never guess a tenant.
5. Pass the resolved organization ID into server-side authorization.

Host resolution never replaces object-level authorization.

## Domain Health

Active domains should be rechecked periodically for:

- DNS still resolving to the expected service.
- HTTPS certificate validity.
- Correct BandWagon challenge response.

Temporary DNS or certificate failures should generate warnings and retry. Do not instantly disable an established organization because of one transient failure.

## FloMoGo Baseline

```text
Service name: FloMoGo
Canonical URL: https://bandwagon.harrisonward.net/o/flomogo
Custom primary: https://flomogo.app
Verification: TXT _bandwagon.flomogo.app
Platform: BandWagon
Operator: Harrison Ward Technology
```
