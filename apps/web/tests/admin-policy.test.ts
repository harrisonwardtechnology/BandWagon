import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canManageProposalSettings } from "../src/lib/event-proposal-policy.ts";
import {
  canChangeOrganizationSettings,
  isOrganizationAdminRole,
  ORGANIZATION_SETTINGS_DENIED,
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

test("organization-wide settings are for owners and admins, not managers", () => {
  assert.equal(canChangeOrganizationSettings("owner"), true);
  assert.equal(canChangeOrganizationSettings("admin"), true);
  assert.equal(canChangeOrganizationSettings("manager"), false);
  assert.equal(canChangeOrganizationSettings("member"), false);
  assert.equal(canChangeOrganizationSettings(null), false);
  assert.equal(canChangeOrganizationSettings(undefined), false);
  // Platform staff with admin access keep it.
  assert.equal(canChangeOrganizationSettings(null, true), true);
  assert.match(ORGANIZATION_SETTINGS_DENIED, /owners and admins/);
});

test("trusted adult and event proposal settings follow the same rule", () => {
  for (const role of ["owner", "admin", "manager", "member", "", null, undefined]) {
    for (const platformAccess of [false, true]) {
      assert.equal(canChangeOrganizationSettings(role, platformAccess), canManageProposalSettings(role, platformAccess), `${role} / ${platformAccess}`);
    }
  }
});

test("the trusted adult setting route refuses managers before saving", async () => {
  const route = await readFile(new URL("../src/app/api/admin/household-delegates/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!canChangeOrganizationSettings\(access\.organizationRole, access\.platformAccess\)\) throw new Error\(ORGANIZATION_SETTINGS_DENIED\);/);
  const post = route.slice(route.indexOf("export async function POST"));
  const check = post.indexOf("await assertMayChangeSettings(identity, organizationId);");
  assert.ok(check > 0, "POST checks the settings rule");
  assert.ok(check < post.indexOf("update organizations set household_delegates_enabled"), "the check runs before the update");
  // Managers can still read the setting, and the page is told whether saving is allowed.
  assert.match(route, /canChangeSettings: await mayChangeSettings\(identity, organizationId\)/);
  const page = await readFile(new URL("../src/app/admin/household-delegates/page.tsx", import.meta.url), "utf8");
  assert.match(page, /disabled=\{working \|\| settings\.canChangeSettings === false\}/);
});
