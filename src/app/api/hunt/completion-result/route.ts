import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET /api/hunt/completion-result?hunt_id=...
 * Returns completion placement and whether player is within winner slots.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const huntId = searchParams.get("hunt_id")?.trim() ?? "";
  if (!huntId) {
    return NextResponse.json({ error: "hunt_id required" }, { status: 400 });
  }

  const userId = auth.user.id;
  const { supabase } = auth;

  const { data: registration } = await supabase
    .from("hunt_registrations")
    .select("id")
    .eq("hunt_id", huntId)
    .eq("player_id", userId)
    .maybeSingle();
  if (!registration) {
    return NextResponse.json({ error: "You are not registered for this hunt" }, { status: 403 });
  }

  let winnersCount = 1;
  try {
    const admin = createServiceRoleClient();
    const { data: hunt } = await admin
      .from("hunts")
      .select("number_of_winners")
      .eq("id", huntId)
      .maybeSingle();
    winnersCount =
      hunt && Number.isFinite((hunt as { number_of_winners?: number }).number_of_winners)
        ? Math.max(1, Number((hunt as { number_of_winners?: number }).number_of_winners))
        : 1;

    // Preferred: dedicated winners table.
    const { data: winnerRows, error: winnerErr } = await admin
      .from("hunt_winners")
      .select("player_id, won_at, created_at")
      .eq("hunt_id", huntId)
      .order("won_at", { ascending: true })
      .order("created_at", { ascending: true });

    let orderedPlayerIds: string[] = [];
    if (!winnerErr && Array.isArray(winnerRows)) {
      orderedPlayerIds = winnerRows
        .map((r: any) => String(r.player_id))
        .filter(Boolean);
    } else {
      // Fallback path: derive from action feed if winners table is unavailable.
      const { data: actionRows } = await admin
        .from("hunt_player_actions")
        .select("player_id, created_at")
        .eq("hunt_id", huntId)
        .eq("action_type", "hunt_won")
        .order("created_at", { ascending: true });
      const seen = new Set<string>();
      orderedPlayerIds = [];
      for (const row of actionRows ?? []) {
        const pid = String((row as { player_id?: string }).player_id ?? "");
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        orderedPlayerIds.push(pid);
      }
    }

    const idx = orderedPlayerIds.findIndex((pid) => pid === userId);
    const placement = idx >= 0 ? idx + 1 : null;
    const isWinner = placement != null ? placement <= winnersCount : null;
    return NextResponse.json({ placement, isWinner, winnersCount });
  } catch (error) {
    logger.warn("hunt/completion-result", "failed to compute completion result", { err: error });
    return NextResponse.json({ placement: null, isWinner: null, winnersCount });
  }
}

