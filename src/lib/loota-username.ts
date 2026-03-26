/** Uniform random in [1, 999_999_999] for `loota_<number>`. */
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
  return `loota_${randomLootaNumericSuffix()}`;
}
