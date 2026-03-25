import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import {
  normalizePlayerIdForDb,
  roundLngLatForPlayerPositionsDb,
} from "@/lib/player-positions-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/hunt/ensure-player-position
 * Upserts `player_positions` for the logged-in user. `player_id` is always taken from the session (never from the body).
 * Use when the browser client upsert fails silently or session/cookie differs from client-only auth.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const huntIdRaw = typeof body.hunt_id === "string" ? body.hunt_id.trim() : "";
  const huntId = huntIdRaw.toLowerCase();
  const lngIn = Number(body.lng);
  const latIn = Number(body.lat);
  const playerNameRaw = typeof body.player_name === "string" ? body.player_name.trim() : "";
  const playerName = playerNameRaw || "Player";

  if (!huntId) {
    return NextResponse.json({ error: "hunt_id required" }, { status: 400 });
  }
  if (!UUID_RE.test(huntId)) {
    return NextResponse.json({ error: "hunt_id must be a valid UUID", hunt_id: huntId }, { status: 400 });
  }
  if (!Number.isFinite(lngIn) || !Number.isFinite(latIn)) {
    return NextResponse.json({ error: "lng and lat must be finite numbers" }, { status: 400 });
  }

  const { lng, lat } = roundLngLatForPlayerPositionsDb(lngIn, latIn);
  const playerId = normalizePlayerIdForDb(user.id);

  // Do not trust client-provided keys. Keep player_positions.keys aligned with
  // server-side progression tracked in hunt_registrations.keys_earned.
  let keys = 0;
  const { data: registration } = await supabase
    .from("hunt_registrations")
    .select("keys_earned")
    .eq("hunt_id", huntId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (registration && Number.isFinite((registration as { keys_earned?: number }).keys_earned)) {
    keys = Math.max(0, Math.floor(Number((registration as { keys_earned?: number }).keys_earned)));
  }
  const travelMode =
    typeof body.travel_mode === "string" && body.travel_mode.trim()
      ? body.travel_mode.trim()
      : "walk";

  const { error } = await supabase.from("player_positions").upsert(
    {
      hunt_id: huntId,
      player_id: playerId,
      player_name: playerName,
      lng,
      lat,
      keys,
      travel_mode: travelMode,
    },
    { onConflict: "hunt_id,player_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Failed to update player position" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
