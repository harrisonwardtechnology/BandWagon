export const ORGANIZATION_TERMS_VERSION = "2026-08-21";
export const ORGANIZATION_PRIVACY_VERSION = "2026-08-21";
export const ORGANIZATION_POLICY_CONFIRMATION = "I ACCEPT FOR THIS ORGANIZATION";

export function isOrganizationPolicyConfirmation(value: unknown) {
  return typeof value === "string" && value.trim() === ORGANIZATION_POLICY_CONFIRMATION;
}

export function organizationPolicyAcceptanceError(input: {
  organizationRole: unknown;
  authorityConfirmed: unknown;
  policiesReviewed: unknown;
  confirmation: unknown;
}) {
  if (input.organizationRole !== "owner") {
    return "Only an organization owner can accept platform policies for the organization";
  }
  if (input.authorityConfirmed !== true) {
    return "Confirm that you are authorized to accept these policies for the organization";
  }
  if (input.policiesReviewed !== true) {
    return "Confirm that you reviewed the current Terms of Use and Privacy Policy";
  }
  if (!isOrganizationPolicyConfirmation(input.confirmation)) {
    return `Type \"${ORGANIZATION_POLICY_CONFIRMATION}\" exactly to continue`;
  }
  return null;
}
