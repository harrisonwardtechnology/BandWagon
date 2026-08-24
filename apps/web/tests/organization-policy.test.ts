import assert from "node:assert/strict";
import test from "node:test";
import {
  ORGANIZATION_POLICY_CONFIRMATION,
  isOrganizationPolicyConfirmation,
  organizationPolicyAcceptanceError,
} from "../src/lib/organization-policy.ts";

test("organization policy acknowledgement requires the exact confirmation phrase", () => {
  assert.equal(isOrganizationPolicyConfirmation(ORGANIZATION_POLICY_CONFIRMATION), true);
  assert.equal(isOrganizationPolicyConfirmation(` ${ORGANIZATION_POLICY_CONFIRMATION} `), true);
  assert.equal(isOrganizationPolicyConfirmation("I accept for this organization"), false);
  assert.equal(isOrganizationPolicyConfirmation(null), false);
});

test("only an authorized organization owner can accept policies", () => {
  assert.match(organizationPolicyAcceptanceError({organizationRole:"admin",authorityConfirmed:true,policiesReviewed:true,confirmation:ORGANIZATION_POLICY_CONFIRMATION})||"",/Only an organization owner/);
  assert.match(organizationPolicyAcceptanceError({organizationRole:"owner",authorityConfirmed:false,policiesReviewed:true,confirmation:ORGANIZATION_POLICY_CONFIRMATION})||"",/authorized/);
  assert.match(organizationPolicyAcceptanceError({organizationRole:"owner",authorityConfirmed:true,policiesReviewed:false,confirmation:ORGANIZATION_POLICY_CONFIRMATION})||"",/reviewed/);
  assert.equal(organizationPolicyAcceptanceError({organizationRole:"owner",authorityConfirmed:true,policiesReviewed:true,confirmation:ORGANIZATION_POLICY_CONFIRMATION}),null);
});
