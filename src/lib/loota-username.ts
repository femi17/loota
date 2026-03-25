/**
 * Compact display for default Loota usernames: 1000 → "1k", 1001 → "1k1", 1_000_000 → "1m", etc.
 */
export function formatLootaNumberSuffix(n: number): string {
  const x = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(x) || x < 0) return "0";
  if (x < 1000) return String(x);
  if (x < 1_000_000) {
    const k = Math.floor(x / 1000);
    const r = x % 1000;
    return r === 0 ? `${k}k` : `${k}k${r}`;
  }
  const m = Math.floor(x / 1_000_000);
  const r = x % 1_000_000;
  if (r === 0) return `${m}m`;
  return `${m}m${formatLootaNumberSuffix(r)}`;
}

/** Uniform random in [1, 999_999_999] for `Loota_<suffix>`. */
export function randomLootaNumericSuffix(): number {
  const max = 999_999_999;
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const hi = buf[0]! >>> 0;
    const lo = buf[1]! >>> 0;
    const combined = (BigInt(hi) << 32n) | BigInt(lo);
    const space = BigInt(max);
    return Number((combined % space) + 1n);
  }
  return 1 + Math.floor(Math.random() * max);
}

export function generateDefaultLootaUsername(): string {
  return `Loota_${formatLootaNumberSuffix(randomLootaNumericSuffix())}`;
}
