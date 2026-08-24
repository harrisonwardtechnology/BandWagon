import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionGraceDays,
  isAccountDeletionConfirmation,
} from "../src/lib/privacy-policy.ts";

test("account deletion requires the complete confirmation phrase", () => {
  assert.equal(isAccountDeletionConfirmation(ACCOUNT_DELETION_CONFIRMATION), true);
  assert.equal(isAccountDeletionConfirmation(`  ${ACCOUNT_DELETION_CONFIRMATION}  `), true);
  assert.equal(isAccountDeletionConfirmation("delete my account"), false);
  assert.equal(isAccountDeletionConfirmation("DELETE ACCOUNT"), false);
  assert.equal(isAccountDeletionConfirmation(null), false);
});

test("account deletion grace period is finite and bounded", () => {
  assert.equal(accountDeletionGraceDays(undefined), 7);
  assert.equal(accountDeletionGraceDays("14"), 14);
  assert.equal(accountDeletionGraceDays("14.9"), 14);
  assert.equal(accountDeletionGraceDays("not-a-number"), 7);
  assert.equal(accountDeletionGraceDays(0), 1);
  assert.equal(accountDeletionGraceDays(90), 30);
});
