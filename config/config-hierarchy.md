# Configuration Hierarchy

Keep configuration in three layers.

| Layer | Examples | Storage |
|---|---|---|
| Deployment secrets | Database URL, SMTP password, Twilio token, OAuth secrets, encryption keys | Coolify environment variables / secret store |
| Platform configuration | Default retention, feature flags, global support contacts | Database-backed platform settings, initialized from env defaults |
| Organization configuration | Minimum driver age, student-driver rule, custom rides, reminder/escalation settings, membership policy | Database, organization admin UI |

Environment variables are never a substitute for per-organization settings that admins need to change without a redeploy.

## Precedence

1. Organization setting, where the setting is intentionally organization-scoped.
2. Platform database setting.
3. Environment default.
4. Safe compiled default only for non-secret development behavior.

Secrets must never be readable or editable through the normal application admin UI.
