import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { isHuntPastEndDate } from "@/lib/hunt-schedule";

/**
 * GET /api/hunt/broadcast-summary?hunt_id=...
 * Public read for broadcast overlay: title, whether hunt time has ended, winner list with display names.
 */
export async function GET(request: NextRequest) {
  const huntId = new URL(request.url).searchParams.get("hunt_id")?.trim() ?? "";
  if (!huntId) {
    return NextResponse.json({ error: "hunt_id required" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const { data: hunt, error: huntErr } = await admin
      .from("hunts")
      .select("id, title, status, end_date, keys_to_win")
      .eq("id", huntId)
      .maybeSingle();

    if (huntErr || !hunt) {
      return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
    }

    const h = hunt as {
      id: string;
      title?: string | null;
      status: string;
      end_date?: string | null;
      keys_to_win?: number | null;
    };

    if (h.status !== "active" && h.status !== "completed") {
      return NextResponse.json({ error: "Hunt not available for broadcast" }, { status: 404 });
    }

    const scheduleEnded =
      h.status === "completed" || isHuntPastEndDate(h.end_date ?? null, Date.now());

    const { data: winnerRows } = await admin
      .from("hunt_winners")
      .select("player_id, keys_earned, won_at")
      .eq("hunt_id", huntId)
      .order("won_at", { ascending: true });

    const ids = [
      ...new Set(
        (winnerRows ?? [])
          .map((r: { player_id?: string }) => String(r.player_id ?? ""))
          .filter(Boolean)
      ),
    ];

    let nameById: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profs } = await admin
        .from("player_profiles")
        .select("user_id, username")
        .in("user_id", ids);
      for (const p of profs ?? []) {
        const uid = String((p as { user_id: string }).user_id);
        const un = (p as { username?: string | null }).username;
        nameById[uid] = (typeof un === "string" && un.trim()) || "Loota";
      }
    }

    const winners = (winnerRows ?? []).map((r: { player_id?: string; keys_earned?: number }) => {
      const pid = String(r.player_id ?? "");
      return {
        name: nameById[pid] ?? "Loota",
        keys: Math.max(0, Number(r.keys_earned) || 0),
      };
    });

    const res = NextResponse.json({
      title: typeof h.title === "string" ? h.title : "Loota Hunt",
      status: h.status,
      endDate: h.end_date ?? null,
      keysToWin: Math.max(1, Number.isFinite(Number(h.keys_to_win)) ? Number(h.keys_to_win) : 5),
      scheduleEnded,
      hasWinners: winners.length > 0,
      winners,
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    logger.error("hunt/broadcast-summary", "failed", { err: error });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
