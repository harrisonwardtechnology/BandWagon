export function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  const safeFallback = Number.isFinite(fallback) ? Math.trunc(fallback) : minimum;
  const result = Number.isFinite(parsed) ? Math.trunc(parsed) : safeFallback;
  return Math.max(minimum, Math.min(maximum, result));
}

export function sessionLifetimeDays(value: unknown) {
  return boundedInteger(value,30,1,90);
}

export function sessionIdleDays(value: unknown) {
  return boundedInteger(value,14,1,30);
}
