import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

/**
 * POST /api/hunt/credit-invite-reward
 * Credits the referrer 500 coins (once per referred user per hunt) when the referred user
 * has just joined the hunt. The referrer is resolved from pending_hunt_referrals (recorded
 * when the user landed on /lobby?ref=...). We do not accept referred_by from the client.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const { data: activeHunt } = await supabase
    .from("hunts")
    .select("id")
    .eq("status", "active")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!activeHunt?.id) {
    return NextResponse.json({ error: "No active hunt" }, { status: 400 });
  }

  const { data: pending } = await supabase
    .from("pending_hunt_referrals")
    .select("referrer_id")
    .eq("hunt_id", activeHunt.id)
    .eq("referred_id", user.id)
    .maybeSingle();

  if (!pending?.referrer_id) {
    return NextResponse.json(
      { error: "No referral to claim. Join via an invite link to credit your inviter." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.rpc("credit_invite_reward", {
    p_referrer_id: pending.referrer_id,
    p_referred_id: user.id,
  });

  if (error) {
    logger.error("hunt/credit-invite-reward", "credit_invite_reward RPC error", { err: error });
    return NextResponse.json({ error: "Failed to credit reward" }, { status: 500 });
  }

  const result = data as { ok?: boolean; error?: string; message?: string; credited?: number };
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error || "Could not credit invite reward" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    credited: result.credited ?? 500,
    message: result.message,
  });
}
