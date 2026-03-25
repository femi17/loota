/**
 * Deterministic lng/lat offset per hunter around a hunt "start" point.
 * Used when we don't have a real device position yet so broadcast/lobby don't stack every avatar on one pixel.
 * Same (huntId, playerId) always yields the same coordinates (stable across refresh and between lobby + broadcast).
 */
function mixSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffff_ffff;
}

function stableSpawnSpreadKmRange(
  huntId: string,
  playerId: string,
  baseLng: number,
  baseLat: number,
  rMinKm: number,
  rMaxKm: number
): { lng: number; lat: number } {
  const u1 = mixSeed(`${huntId}\0${playerId}\0spawnA`);
  const u2 = mixSeed(`${huntId}\0${playerId}\0spawnB`);
  const angle = u1 * Math.PI * 2;
  const rKm = rMinKm + u2 * (rMaxKm - rMinKm);
  const cosLat = Math.max(0.25, Math.cos((baseLat * Math.PI) / 180));
  const dxKm = rKm * Math.sin(angle);
  const dyKm = rKm * Math.cos(angle);
  const dLat = dyKm / 111;
  const dLng = dxKm / (111 * cosLat);
  return {
    lng: baseLng + dLng,
    lat: baseLat + dLat,
  };
}

/** ~150 m – ~2.4 km around a fallback point (no GPS). */
export function stableSpawnSpreadLngLat(
  huntId: string,
  playerId: string,
  baseLng: number,
  baseLat: number
): { lng: number; lat: number } {
  return stableSpawnSpreadKmRange(huntId, playerId, baseLng, baseLat, 0.15, 2.4);
}

/** ~25–120 m around device GPS — keeps real location readable, avoids exact pixel stack. */
export function stableDeviceSpawnSpreadLngLat(
  huntId: string,
  playerId: string,
  baseLng: number,
  baseLat: number
): { lng: number; lat: number } {
  return stableSpawnSpreadKmRange(huntId, playerId, baseLng, baseLat, 0.025, 0.12);
}

const COORD_EPS = 1e-5;

type SpawnSpreadRow = {
  player_id: string;
  lng: number;
  lat: number;
  keys?: number | null;
  answering_question?: boolean | null;
  travel_started_at?: string | null;
  travel_duration_ms?: number | string | null;
};

/**
 * If multiple hunters still share the exact same pre-game spawn (e.g. legacy rows before spawn-spread),
 * nudge each with stableSpawnSpreadLngLat. Skips anyone mid-travel, on a quiz, or with keys > 0.
 */
export function spreadStackedPregameSpawns(
  huntId: string,
  posData: SpawnSpreadRow[],
  baseLng: number,
  baseLat: number
): void {
  const atBase = posData.filter((r) => {
    if (!r?.player_id) return false;
    if (Math.abs(Number(r.lng) - baseLng) > COORD_EPS) return false;
    if (Math.abs(Number(r.lat) - baseLat) > COORD_EPS) return false;
    const k = Number(r.keys ?? 0);
    if (!Number.isFinite(k) || k > 0) return false;
    if (r.answering_question) return false;
    const started = r.travel_started_at != null && String(r.travel_started_at).trim() !== "";
    const dur = parseDurationMs(r.travel_duration_ms);
    if (started && dur != null && dur > 0) return false;
    return true;
  });
  if (atBase.length <= 1) return;
  for (const row of atBase) {
    const s = stableSpawnSpreadLngLat(huntId, String(row.player_id), baseLng, baseLat);
    row.lng = s.lng;
    row.lat = s.lat;
  }
}

function parseDurationMs(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}
