import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/hunt/finalize-hunt-end
 * Idempotent: when server time is past hunts.end_date, records any missing hunt_winners
 * (keys >= keys_to_win) and sets hunt status to completed.
 * Callable without auth (e.g. broadcast page) — only acts if DB end_date has passed.
 */
export async function POST(request: NextRequest) {
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

  try {
    const admin = createServiceRoleClient();
    const { data: hunt, error: huntErr } = await admin
      .from("hunts")
      .select("id, status, end_date, keys_to_win")
      .eq("id", huntId)
      .maybeSingle();

    if (huntErr || !hunt) {
      return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
    }

    const row = hunt as {
      id: string;
      status: string;
      end_date?: string | null;
      keys_to_win?: number | null;
    };

    if (row.status !== "active") {
      return NextResponse.json({ ok: true, alreadyFinalized: true });
    }

    const endRaw = row.end_date;
    if (!endRaw || typeof endRaw !== "string") {
      return NextResponse.json({ error: "Hunt has no end_date" }, { status: 400 });
    }

    const endMs = new Date(endRaw.trim()).getTime();
    if (!Number.isFinite(endMs)) {
      return NextResponse.json({ error: "Invalid end_date" }, { status: 400 });
    }

    if (Date.now() < endMs) {
      return NextResponse.json({ error: "Hunt has not ended yet" }, { status: 400 });
    }

    const keysToWin = Math.max(
      1,
      Number.isFinite(Number(row.keys_to_win)) ? Number(row.keys_to_win) : 5
    );

    const wonAtIso = new Date(endMs).toISOString();

    const [{ data: positions }, { data: existingWinners }] = await Promise.all([
      admin.from("player_positions").select("player_id, keys, player_name").eq("hunt_id", huntId),
      admin.from("hunt_winners").select("player_id").eq("hunt_id", huntId),
    ]);

    const existing = new Set(
      (existingWinners ?? []).map((r: { player_id: string }) => String(r.player_id))
    );

    let newlyRecorded = 0;
    for (const pos of positions ?? []) {
      const pid = String((pos as { player_id?: string }).player_id ?? "");
      if (!pid) continue;
      const keys = Math.max(0, Number((pos as { keys?: number }).keys) || 0);
      if (keys < keysToWin) continue;
      if (existing.has(pid)) continue;

      const { error: upErr } = await admin.from("hunt_winners").upsert(
        {
          hunt_id: huntId,
          player_id: pid,
          keys_earned: keys,
          keys_required: keysToWin,
          won_at: wonAtIso,
        },
        { onConflict: "hunt_id,player_id" }
      );

      if (upErr) {
        logger.warn("hunt/finalize-hunt-end", "hunt_winners upsert failed", { err: upErr, pid });
        continue;
      }

      existing.add(pid);
      newlyRecorded += 1;

      await admin
        .from("hunt_registrations")
        .update({ keys_earned: keys })
        .eq("hunt_id", huntId)
        .eq("player_id", pid);

      try {
        await admin.from("hunt_player_actions").insert({
          hunt_id: huntId,
          player_id: pid,
          player_name:
            typeof (pos as { player_name?: string }).player_name === "string"
              ? (pos as { player_name: string }).player_name
              : "Winner",
          action_type: "hunt_won",
          payload: {
            keys_earned: keys,
            keys_required: keysToWin,
            won_at: wonAtIso,
            finalized_at_deadline: true,
          },
        });
      } catch {
        // feed is optional
      }
    }

    const { data: updatedRows, error: statusErr } = await admin
      .from("hunts")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", huntId)
      .eq("status", "active")
      .select("id");

    if (statusErr) {
      logger.error("hunt/finalize-hunt-end", "failed to mark hunt completed", { err: statusErr });
      return NextResponse.json({ error: "Failed to complete hunt" }, { status: 500 });
    }

    if (!updatedRows?.length) {
      return NextResponse.json({ ok: true, newlyRecorded, alreadyCompleted: true });
    }

    return NextResponse.json({ ok: true, newlyRecorded });
  } catch (error) {
    logger.error("hunt/finalize-hunt-end", "unexpected error", { err: error });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
