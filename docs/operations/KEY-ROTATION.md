# Key Rotation Runbook

BandWagon separates data encryption, blind lookup hashes, and authentication/session signing so each can be rotated with a known impact.

## Data Encryption Key

`DATA_ENCRYPTION_KEY` encrypts phone numbers, OTP destinations, exact locations, safety coordinates, event-intake text, and Google/Microsoft OAuth tokens. `DATA_ENCRYPTION_KEY_PREVIOUS` permits staged decryption while rows are re-encrypted. `LOOKUP_HASH_KEY` keeps blind indexes stable while the data key changes.

Before the first data-key rotation, set `LOOKUP_HASH_KEY` to the current `DATA_ENCRYPTION_KEY` value and redeploy. Do not generate a different lookup key: existing phone, join-code, support-session, decommission, and request-fingerprint hashes cannot all be reconstructed.

Rotation procedure:

1. Take and retain an encrypted database backup.
2. Generate a new random key of at least 32 characters.
3. Set the new value as `DATA_ENCRYPTION_KEY`, the old value as `DATA_ENCRYPTION_KEY_PREVIOUS`, and keep `LOOKUP_HASH_KEY` unchanged.
4. Redeploy. The application writes with the new key and can read both keys.
5. From an application container, validate every encrypted row without committing:

   ```bash
   npm run security:rotate-data-key -- --dry-run
   ```

6. Apply the atomic re-encryption transaction:

   ```bash
   ROTATION_CONFIRM="ROTATE DATA ENCRYPTION" npm run security:rotate-data-key
   ```

7. Confirm the `data-key-rotation` service is healthy in Platform Health and smoke-test login, private locations, safety, event intake, and both calendar providers.
8. Remove `DATA_ENCRYPTION_KEY_PREVIOUS`, redeploy, and repeat the smoke tests.
9. Retain the old key only in the restricted recovery record for the backup-retention period, then destroy it under the secret-management policy.

The rotation script is transactional. A failure rolls back all database changes. Never remove the previous key before the script and smoke tests complete.

## Authentication Secret

Rotating `AUTH_SECRET` invalidates active sessions, OTP challenges, OAuth state values, and other short-lived signatures. Schedule a maintenance window, rotate the value, redeploy all instances together, and tell users they must sign in again. Delete expired session and OTP rows during the next privacy-maintenance run.

## Provider Credentials

Rotate OAuth client secrets, SMTP credentials, Twilio credentials, S3 keys, monitoring bridge tokens, and cron secrets at their provider. Overlap old/new credentials where the provider supports it, update Coolify secrets, redeploy, test the integration, then revoke the old credential. Never store a credential or its value in an audit event.
