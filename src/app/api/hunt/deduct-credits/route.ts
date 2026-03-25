import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";

/**
 * POST /api/hunt/deduct-credits
 * Deduct credits from the current user's wallet and optionally add to hunt total_spent.
 * Uses atomic RPC deduct_credits to avoid race conditions.
 * Body: { amount: number, hunt_id?: string }
 * Returns: { newCredits: number } or { error: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  let body: { amount?: number; hunt_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body?.amount === "number" ? body.amount : 0;
  const huntId = typeof body?.hunt_id === "string" && body.hunt_id.trim() ? body.hunt_id.trim() : null;

  if (amount <= 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("deduct_credits", {
    p_amount: amount,
    p_hunt_id: huntId || null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
    }
    if (msg.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg.includes("Invalid amount")) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 });
  }

  const newCredits = typeof data?.new_credits === "number" ? data.new_credits : Number(data?.new_credits ?? 0);
  return NextResponse.json({ newCredits });
}
