export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export function isAccountDeletionConfirmation(value: unknown) {
  return typeof value === "string" && value.trim() === ACCOUNT_DELETION_CONFIRMATION;
}

export function accountDeletionGraceDays(value: unknown, fallback = 7) {
  const parsed = Number(value);
  const safeFallback = Number.isFinite(fallback) ? Math.trunc(fallback) : 7;
  const days = Number.isFinite(parsed) ? Math.trunc(parsed) : safeFallback;
  return Math.max(1, Math.min(30, days));
}
