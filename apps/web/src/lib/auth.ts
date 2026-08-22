/**
 * Authentication scaffold only.
 * Planned production flows:
 * - mandatory verified email
 * - email magic-link / OTP sign-in
 * - optional verified phone RCS/SMS approval
 * - step-up auth for sensitive actions
 * - revocable remembered-device sessions
 */
export type SessionIdentity = {
  userAccountId: string;
  personId: string;
  organizationIds: string[];
};

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  return null;
}
