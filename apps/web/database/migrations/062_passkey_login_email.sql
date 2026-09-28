BEGIN;

-- Managed students may sign in only with the login email their guardian
-- authorized (managed_student_account_access.login_email_id). A passkey a
-- managed student registers records that email, and passkey sign-in requires
-- it to still be the authorized one. NULL for everyone else.
ALTER TABLE webauthn_credentials
  ADD COLUMN IF NOT EXISTS login_email_id uuid REFERENCES emails(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS webauthn_credentials_login_email_idx
  ON webauthn_credentials(login_email_id)
  WHERE login_email_id IS NOT NULL;

-- Passkeys managed students registered before this column existed cannot be
-- tied to an authorized email, so remove them (fail closed). Those students
-- sign in with a code and can add a new passkey.
DELETE FROM webauthn_credentials wc
 USING managed_student_account_access msa, people p
 WHERE msa.person_id = wc.person_id
   AND p.id = wc.person_id
   AND p.person_type = 'minor'
   AND wc.login_email_id IS NULL;

COMMIT;
