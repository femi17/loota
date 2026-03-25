import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { checkRequestBodySize } from "@/lib/request-utils";

const BUYABLE_IDS = ["bicycle", "motorbike", "car"] as const;
const COIN_COST: Record<string, number> = {
  bicycle: 2_500,
  motorbike: 9_000,
  car: 22_000,
};
const IDEMPOTENCY_WINDOW_HOURS = 24;

/**
 * POST /api/inventory/purchase
 * Purchase a travel mode with wallet (credits). Uses atomic RPC purchase_travel_mode
 * so deduct + inventory + transaction are one transaction (no partial state on failure).
 * Body: { item_id: "bicycle" | "motorbike" | "car", idempotency_key?: string }
 * Returns: { newCredits: number } or { error: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const sizeCheck = checkRequestBodySize(request);
  if (sizeCheck) return sizeCheck;

  let body: { item_id?: string; idempotency_key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : null;
  if (idempotencyKey && idempotencyKey.length > 0 && idempotencyKey.length <= 128) {
    const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("idempotency_requests")
      .select("response_status, response_body")
      .eq("idempotency_key", idempotencyKey)
      .eq("user_id", user.id)
      .gte("created_at", windowStart)
      .maybeSingle();
    if (existing?.response_body != null) {
      return NextResponse.json(existing.response_body as object, { status: existing.response_status as number });
    }
  }

  const itemId = typeof body?.item_id === "string" ? body.item_id.trim() : "";
  if (!BUYABLE_IDS.includes(itemId as (typeof BUYABLE_IDS)[number])) {
    return NextResponse.json({ error: "Invalid item_id" }, { status: 400 });
  }

  const cost = COIN_COST[itemId];
  if (!Number.isFinite(cost) || cost <= 0) {
    return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("purchase_travel_mode", {
    p_item_id: itemId,
    p_cost: cost,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Insufficient credits")) {
      return NextResponse.json(
        { error: "Not enough credits. Load your wallet first." },
        { status: 400 }
      );
    }
    if (msg.includes("Invalid item_id") || msg.includes("Invalid cost")) {
      return NextResponse.json({ error: "Invalid item_id or cost" }, { status: 400 });
    }
    if (msg.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to complete purchase" }, { status: 500 });
  }

  const newCredits = typeof data?.new_credits === "number" ? data.new_credits : Number(data?.new_credits ?? 0);
  const response = { newCredits };

  if (idempotencyKey && idempotencyKey.length > 0) {
    await supabase.from("idempotency_requests").upsert(
      {
        idempotency_key: idempotencyKey,
        user_id: user.id,
        response_status: 200,
        response_body: response,
        created_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key,user_id" }
    );
  }

  return NextResponse.json(response);
}
