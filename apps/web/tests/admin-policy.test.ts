import assert from "node:assert/strict";
import test from "node:test";
import {
  isOrganizationAdminRole,
  parsePlatformRole,
  platformRoleChangeError,
} from "../src/lib/admin-policy.ts";

test("organization administration accepts only elevated organization roles", () => {
  assert.equal(isOrganizationAdminRole("owner"), true);
  assert.equal(isOrganizationAdminRole("admin"), true);
  assert.equal(isOrganizationAdminRole("manager"), true);
  assert.equal(isOrganizationAdminRole("member"), false);
  assert.equal(isOrganizationAdminRole(null), false);
});

test("platform roles parse explicitly and reject unknown values", () => {
  assert.equal(parsePlatformRole("support"), "support");
  assert.equal(parsePlatformRole("none"), null);
  assert.equal(parsePlatformRole(null), null);
  assert.throws(() => parsePlatformRole("superadmin"), /Invalid platform role/);
});

test("an owner cannot change their own platform role", () => {
  assert.match(
    platformRoleChangeError({
      operatorUserAccountId: "account-1",
      targetUserAccountId: "account-1",
      currentRole: "owner",
      requestedRole: "support",
      otherActiveOwnerCount: 2,
    }) || "",
    /Another platform owner/
  );
});

test("the final active platform owner cannot be removed", () => {
  assert.match(
    platformRoleChangeError({
      operatorUserAccountId: "account-1",
      targetUserAccountId: "account-2",
      currentRole: "owner",
      requestedRole: null,
      otherActiveOwnerCount: 0,
    }) || "",
    /at least one active platform owner/
  );
  assert.equal(
    platformRoleChangeError({
      operatorUserAccountId: "account-1",
      targetUserAccountId: "account-2",
      currentRole: "owner",
      requestedRole: "support",
      otherActiveOwnerCount: 1,
    }),
    null
  );
});
