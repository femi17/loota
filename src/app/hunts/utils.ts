import type { LngLat, TaskCategoryId, TaskItem } from "./types";
import { NIGERIA_BBOX, TASK_BANK, TASK_CATEGORY_ORDER } from "./constants";

/** Nigeria bounds [minLng, minLat, maxLng, maxLat]. Reject (0,0) and out-of-bounds. */
export function isLngLatInNigeria(pos: { lng: number; lat: number }): boolean {
  const [minLng, minLat, maxLng, maxLat] = NIGERIA_BBOX;
  if (!Number.isFinite(pos.lng) || !Number.isFinite(pos.lat)) return false;
  if (pos.lng === 0 && pos.lat === 0) return false;
  return pos.lng >= minLng && pos.lng <= maxLng && pos.lat >= minLat && pos.lat <= maxLat;
}

/** Parse waypoint from DB: object { lng, lat }, { coordinates: [lng, lat] }, or array [lng, lat]. Tolerates lat/lng swapped. */
export function parseWaypointCoords(w: unknown): { lng: number; lat: number } | null {
  const toNum = (v: unknown): number =>
    typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!w) return null;

  if (Array.isArray(w) && w.length >= 2) {
    const a = toNum(w[0]);
    const b = toNum(w[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const asLngLat = { lng: a, lat: b };
    const asLatLng = { lng: b, lat: a };
    if (isLngLatInNigeria(asLngLat)) return asLngLat;
    if (isLngLatInNigeria(asLatLng)) return asLatLng;
    return asLngLat;
  }

  if (typeof w !== "object") return null;
  const o = w as Record<string, unknown>;

  const coords = o.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const a = toNum(coords[0]);
    const b = toNum(coords[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const asLngLat = { lng: a, lat: b };
      const asLatLng = { lng: b, lat: a };
      if (isLngLatInNigeria(asLngLat)) return asLngLat;
      if (isLngLatInNigeria(asLatLng)) return asLatLng;
      return asLngLat;
    }
  }

  const lng = o.lng ?? o.longitude;
  const lat = o.lat ?? o.latitude;
  const lngN = toNum(lng);
  const latN = toNum(lat);
  if (!Number.isFinite(lngN) || !Number.isFinite(latN)) return null;
  const asStored = { lng: lngN, lat: latN };
  if (isLngLatInNigeria(asStored)) return asStored;
  const swapped = { lng: latN, lat: lngN };
  if (isLngLatInNigeria(swapped)) return swapped;
  return asStored;
}

export function lightPresetForLocalTime(d = new Date()): "dawn" | "day" | "dusk" | "night" {
  const hour = d.getHours();
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function fmtCoord(n: number) {
  return n.toFixed(5);
}

export function normAnswer(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function hash32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function haversineKm(a: LngLat, b: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Full travel leg emitted by hunts and replayed by broadcast. */
export type TravelLeg = {
  huntId: string;
  playerId: string;
  modeId: string;
  from: { lng: number; lat: number };
  to: { lng: number; lat: number };
  routeCoords: [number, number][];
  durationMs: number;
  startedAt: string; // ISO timestamp
};

/**
 * Single source of truth for position along route — used by hunt and broadcast.
 * Same formula everywhere = same smooth movement.
 */
export function positionAlongRouteAt(
  route: Array<[number, number]>,
  startedAtMs: number,
  durationMs: number,
  sampleAtMs: number
): LngLat {
  if (route.length < 2 || durationMs <= 0) {
    const p = route[0];
    return p ? { lng: p[0], lat: p[1] } : { lng: 0, lat: 0 };
  }
  const progress = clamp((sampleAtMs - startedAtMs) / durationMs, 0, 1);
  const cumKm: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    const a = { lng: route[i - 1][0], lat: route[i - 1][1] };
    const b = { lng: route[i][0], lat: route[i][1] };
    cumKm.push(cumKm[i - 1] + haversineKm(a, b));
  }
  const totalKm = cumKm[cumKm.length - 1] ?? 0;
  const targetKm = totalKm * progress;
  let i = 1;
  while (i < cumKm.length && cumKm[i] < targetKm) i++;
  i = clamp(i, 1, cumKm.length - 1);
  const prevKm = cumKm[i - 1];
  const segKm = cumKm[i] - prevKm || 1e-9;
  const localT = clamp((targetKm - prevKm) / segKm, 0, 1);
  const a = route[i - 1];
  const b = route[i];
  return {
    lng: a[0] + (b[0] - a[0]) * localT,
    lat: a[1] + (b[1] - a[1]) * localT,
  };
}

/**
 * Thin wrapper around positionAlongRouteAt for a full leg.
 * Shared by hunts (live) and broadcast (replay) so both use identical math.
 */
export function positionAlongLegAtTime(leg: TravelLeg, sampleAtMs: number): LngLat {
  const startedAtMs = new Date(leg.startedAt).getTime();
  return positionAlongRouteAt(leg.routeCoords, startedAtMs, leg.durationMs, sampleAtMs);
}

/**
 * Single source of truth for position along route — used by hunt and broadcast.
 * Same formula everywhere = same smooth movement.
 */
export function positionAlongRoute(
  route: Array<[number, number]>,
  startedAtMs: number,
  durationMs: number
): LngLat {
  return positionAlongRouteAt(route, startedAtMs, durationMs, Date.now());
}

export function bearingDeg(from: LngLat, to: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/** Destination point given start, distance in km, and bearing in degrees (0 = north). */
export function destinationPointFromBearing(from: LngLat, distanceKm: number, bearingDegrees: number): LngLat {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const brng = toRad(bearingDegrees);
  const lat1 = toRad(from.lat);
  const d = distanceKm / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    toRad(from.lng) +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

export function taskCategoryForStep(stepNumber: number): TaskCategoryId {
  const s = Math.max(1, Math.floor(stepNumber));
  const idx = (s - 1) % TASK_CATEGORY_ORDER.length;
  return TASK_CATEGORY_ORDER[idx]!;
}

export function pickTask(
  category: TaskCategoryId,
  seed: number,
  stepNumber: number,
  attempt: number
): TaskItem {
  const bank = TASK_BANK[category] ?? [];
  if (!bank.length) {
    return { id: "fallback", category, prompt: "Solve: 2 + 2 = ?", answers: ["4"] };
  }
  const rng = mulberry32((seed ^ (stepNumber * 2654435761)) + attempt * 1013904223);
  const idx = Math.floor(rng() * bank.length);
  return bank[idx]!;
}

export function arrivalRankFor(
  stepNumber: number,
  seed: number,
  pos: LngLat | null,
  attempt: number
): number {
  const latKey = pos ? Math.round(pos.lat * 1000) : 0;
  const lngKey = pos ? Math.round(pos.lng * 1000) : 0;
  const key = `${seed}:${stepNumber}:${latKey}:${lngKey}`;
  const base = 1 + (hash32(key) % 12);
  return clamp(base + Math.max(0, attempt), 1, 99);
}

export function ordinal(n: number): string {
  const s = String(n);
  const last = s.slice(-1);
  const last2 = s.slice(-2);
  if (last2 >= "11" && last2 <= "13") return s + "th";
  if (last === "1") return s + "st";
  if (last === "2") return s + "nd";
  if (last === "3") return s + "rd";
  return s + "th";
}

/** Remove ", Nigeria" from the end of a place label so the target word doesn't always show Nigeria. */
export function shortenPlaceLabel(label: string): string {
  if (!label || typeof label !== "string") return label;
  const trimmed = label.replace(/,\s*Nigeria\s*$/i, "").trim();
  return trimmed || label.trim();
}
