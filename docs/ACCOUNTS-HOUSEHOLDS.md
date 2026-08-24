# BandWagon Accounts & Households

BandWagon models a household separately from an organization. A family can therefore participate in more than one BandWagon organization without duplicating its people or contact information.

## Core model

- `people` is the person profile.
- `user_accounts` is the sign-in identity for a person who can authenticate.
- `households` represents a family/household.
- `household_members` links people to a household and assigns manager/adult/student/dependent roles.
- `guardian_relationships` explicitly records which adults may manage a minor profile and approve rides.
- `memberships` links a person to an organization such as FloMoGo.
- `emails` stores verified email addresses.
- `phones` stores the E.164 phone encrypted with `DATA_ENCRYPTION_KEY`; only a keyed lookup hash is searchable.
- `organization_join_codes` provides the foundation for self-service organization enrollment.

## Privacy rules

Phone numbers are encrypted at rest using AES-256-GCM and are never stored in plaintext. Email and phone visibility remain hidden by default. The notification router resolves a verified phone internally only when SMS/RCS is actually required.

## Parent / student behavior

Students default to `student_approval_required=true`. A guardian relationship records whether the adult can approve rides and manage the student's profile. This is intentionally separate from household membership so custody/guardian arrangements do not have to be inferred from a shared household.

## Multi-tenant behavior

A household is platform-level, not owned by one organization. Each person joins organizations independently through `memberships`. This allows the same household to participate in FloMoGo and another future tenant without maintaining duplicate family records.

## Admin development console

After applying migration `007_accounts_households.sql`:

`/admin/accounts`

The console can create a test household, parent/manager, student, verified contact methods, FloMoGo memberships and guardian relationships. It requires a signed-in platform owner and is intended for development/testing, not end-user production onboarding.

## Next authentication work

The production onboarding flow will replace the admin console with:

1. Email or phone verification.
2. Parent account creation.
3. Household creation or join.
4. Student/dependent creation.
5. Organization join code.
6. Parent approval preferences.
7. Push enrollment.

The database model is designed so those flows can be added without changing the household/guardian structure.
