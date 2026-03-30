import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/hunt/record-winner
 * Record winner only after server-side key verification.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { supabase, user } = auth;

  let body: { hunt_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const huntId = typeof body?.hunt_id === "string" ? body.hunt_id.trim() : "";
  if (!huntId) {
    return NextResponse.json({ error: "hunt_id required" }, { status: 400 });
  }

  const { data: registration } = await supabase
    .from("hunt_registrations")
    .select("id")
    .eq("hunt_id", huntId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "You are not registered for this hunt" }, { status: 403 });
  }

  const admin = createServiceRoleClient();

  const [{ data: hunt }, { data: reg }, { data: pos }] = await Promise.all([
    admin.from("hunts").select("id, keys_to_win, status").eq("id", huntId).maybeSingle(),
    admin
      .from("hunt_registrations")
      .select("keys_earned")
      .eq("hunt_id", huntId)
      .eq("player_id", user.id)
      .maybeSingle(),
    admin
      .from("player_positions")
      .select("keys")
      .eq("hunt_id", huntId)
      .eq("player_id", user.id)
      .maybeSingle(),
  ]);

  if (!hunt) {
    return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
  }

  if ((hunt as { status?: string }).status && (hunt as { status: string }).status !== "active") {
    return NextResponse.json({ error: "This hunt is no longer active" }, { status: 403 });
  }

  const requiredKeys = Math.max(
    1,
    Number.isFinite((hunt as { keys_to_win?: number }).keys_to_win)
      ? Number((hunt as { keys_to_win?: number }).keys_to_win)
      : 5
  );
  // Gameplay stores key count on player_positions (see validate-answer — hunt_registrations.keys_earned is not updated on quiz).
  const regKeys = Math.max(
    0,
    Number.isFinite((reg as { keys_earned?: number } | null)?.keys_earned)
      ? Number((reg as { keys_earned?: number }).keys_earned)
      : 0
  );
  const posKeys = Math.max(
    0,
    Number.isFinite((pos as { keys?: number } | null)?.keys) ? Number((pos as { keys?: number }).keys) : 0
  );
  const currentKeys = Math.max(regKeys, posKeys);

  if (currentKeys < requiredKeys) {
    return NextResponse.json(
      { error: `Winner can only be recorded after all ${requiredKeys} keys are collected` },
      { status: 403 }
    );
  }

  const wonAt = new Date().toISOString();
  const payload = {
    hunt_id: huntId,
    player_id: user.id,
    keys_earned: currentKeys,
    keys_required: requiredKeys,
    won_at: wonAt,
  };

  // Preferred: dedicated winners table (DB trigger handles level increment on INSERT)
  const { error: winnerErr } = await admin
    .from("hunt_winners")
    .upsert(payload, { onConflict: "hunt_id,player_id" });

  if (winnerErr) {
    logger.warn("hunt/record-winner", "hunt_winners upsert failed, fallback to action feed", {
      err: winnerErr,
    });

    const { data: existingWon } = await admin
      .from("hunt_player_actions")
      .select("id")
      .eq("hunt_id", huntId)
      .eq("player_id", user.id)
      .eq("action_type", "hunt_won")
      .limit(1)
      .maybeSingle();

    if (!existingWon) {
      const { error: actionErr } = await admin.from("hunt_player_actions").insert({
        hunt_id: huntId,
        player_id: user.id,
        player_name: "Winner",
        action_type: "hunt_won",
        payload: { keys_earned: currentKeys, keys_required: requiredKeys, won_at: wonAt },
      });
      if (actionErr) {
        logger.error("hunt/record-winner", "fallback action insert failed", { err: actionErr });
        return NextResponse.json({ error: "Failed to record winner" }, { status: 500 });
      }

      // No hunt_winners row => DB trigger did not run. Increment once here.
      const { data: prof } = await admin
        .from("player_profiles")
        .select("level")
        .eq("user_id", user.id)
        .maybeSingle();
      const nextLevel = Math.max(1, (typeof prof?.level === "number" ? prof.level : 1) + 1);
      const { error: levelErr } = await admin
        .from("player_profiles")
        .update({ level: nextLevel })
        .eq("user_id", user.id);
      if (levelErr) {
        logger.warn("hunt/record-winner", "level increment failed after fallback win", { err: levelErr });
      }
    }

    await admin
      .from("hunt_registrations")
      .update({ keys_earned: currentKeys })
      .eq("hunt_id", huntId)
      .eq("player_id", user.id);

    return NextResponse.json({ ok: true, fallback: true });
  }

  // Keep hunt_registrations aligned with gameplay (player_positions) for reporting.
  await admin
    .from("hunt_registrations")
    .update({ keys_earned: currentKeys })
    .eq("hunt_id", huntId)
    .eq("player_id", user.id);

  // Optional feed action for broadcast/admin timeline.
  await admin.from("hunt_player_actions").insert({
    hunt_id: huntId,
    player_id: user.id,
    player_name: "Winner",
    action_type: "hunt_won",
    payload: { keys_earned: currentKeys, keys_required: requiredKeys, won_at: wonAt },
  });

  return NextResponse.json({ ok: true });
}
