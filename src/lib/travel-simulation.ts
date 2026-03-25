/**
 * Shared travel simulation engine.
 *
 * This is the EXACT same math the hunt page uses to animate the player's avatar
 * along a route. Both the hunt page and the broadcast page run this engine so
 * movement is pixel-perfect identical.
 *
 * The engine is a pure function: given parameters and the current time, it
 * returns the current position. No React, no DOM, no side effects.
 */

export type LngLat = { lng: number; lat: number };

export type TravelSimParams = {
  coords: [number, number][];
  cumKm: number[];
  totalKm: number;
  to: LngLat;
  modeId: string;
  durationMs: number;
  /** LOCAL broadcast clock timestamp — NOT the DB's travel_started_at */
  startedAt: number;
  /** Set to true when a constraint/stop is active; sim won't advance */
  paused: boolean;
  /** When the pause started (local clock) — used to shift startedAt on resume */
  pausedAt: number;
};

export type TravelSimResult = {
  pos: LngLat;
  pAnim: number;
  finished: boolean;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function haversineKm(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDeg(from: LngLat, to: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Build cumulative distance array for a coordinate polyline. */
export function buildCumKm(coords: [number, number][]): { cumKm: number[]; totalKm: number } {
  const cumKm: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const a: LngLat = { lng: coords[i - 1][0], lat: coords[i - 1][1] };
    const b: LngLat = { lng: coords[i][0], lat: coords[i][1] };
    cumKm.push(cumKm[i - 1] + haversineKm(a, b));
  }
  return { cumKm, totalKm: cumKm[cumKm.length - 1] ?? 0 };
}

/** Project a point onto the polyline and return the km distance along it. */
export function projectOnRoute(pos: LngLat, coords: [number, number][], cumKm: number[]): number {
  let bestDistSq = Infinity;
  let bestKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0], ay = coords[i][1];
    const bx = coords[i + 1][0], by = coords[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? clamp(((pos.lng - ax) * dx + (pos.lat - ay) * dy) / lenSq, 0, 1) : 0;
    const px = ax + dx * t, py = ay + dy * t;
    const ex = pos.lng - px, ey = pos.lat - py;
    const dSq = ex * ex + ey * ey;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestKm = cumKm[i] + (cumKm[i + 1] - cumKm[i]) * t;
    }
  }
  return bestKm;
}

/**
 * Compute current position along a travel route.
 *
 * This is the EXACT same interpolation the hunt page uses in its setInterval tick.
 * Given the travel parameters and the current time, returns the avatar position.
 */
export function simulateTravelTick(params: TravelSimParams, now: number): TravelSimResult {
  if (params.paused) {
    const elapsed = params.pausedAt - params.startedAt;
    const pAnim = clamp(elapsed / Math.max(1, params.durationMs), 0, 1);
    const pos = interpolateAtPAnim(params, pAnim);
    return { pos, pAnim, finished: false };
  }

  const durationMs = Math.max(1, params.durationMs);
  const pAnim = clamp((now - params.startedAt) / durationMs, 0, 1);

  if (pAnim >= 1) {
    return { pos: params.to, pAnim: 1, finished: true };
  }

  const pos = interpolateAtPAnim(params, pAnim);
  return { pos, pAnim, finished: false };
}

function interpolateAtPAnim(params: TravelSimParams, pAnim: number): LngLat {
  const targetKm = params.totalKm * pAnim;
  let i = 1;
  while (i < params.cumKm.length && params.cumKm[i] < targetKm) i++;
  i = clamp(i, 1, params.cumKm.length - 1);
  const prevKm = params.cumKm[i - 1];
  const segKm = params.cumKm[i] - prevKm || 1e-9;
  const localT = clamp((targetKm - prevKm) / segKm, 0, 1);
  const a = params.coords[i - 1];
  const b = params.coords[i];
  return {
    lng: a[0] + (b[0] - a[0]) * localT,
    lat: a[1] + (b[1] - a[1]) * localT,
  };
}
