/**
 * Hunt schedule helpers — compare DB ISO timestamps to local clock.
 */

export function getMsUntilHuntEnd(endDateIso: string | null | undefined): number | null {
  if (!endDateIso || typeof endDateIso !== "string") return null;
  const t = new Date(endDateIso.trim()).getTime();
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

export function isHuntPastEndDate(
  endDateIso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!endDateIso || typeof endDateIso !== "string") return false;
  const t = new Date(endDateIso.trim()).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs >= t;
}
