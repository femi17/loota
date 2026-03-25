/**
 * `player_positions.lng` / `lat` are NUMERIC(10, 7) in database_schema.sql — PostgREST can return 400
 * if values are sent with excessive precision or odd float representation. Always round before upsert.
 */
export function roundLngLatForPlayerPositionsDb(lng: number, lat: number): { lng: number; lat: number } {
  const r = (x: number) => Math.round(x * 1e7) / 1e7;
  return { lng: r(lng), lat: r(lat) };
}

/** RLS compares `player_id` (TEXT) to `auth.uid()::text` — must match casing (Postgres text is case-sensitive). */
export function normalizePlayerIdForDb(playerId: string): string {
  return String(playerId).trim().toLowerCase();
}
