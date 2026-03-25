import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
/** Kobo per coin. 50 = 0.5 NGN per coin (N1000 → 2000 coins, N2500 → 5000, N5000 → 10000). */
const KOBOS_PER_COIN = Math.max(1, Number(process.env.PAYSTACK_KOBOS_PER_COIN) || 50);

type PaystackEvent = {
  event: string;
  data: {
    reference: string;
    amount?: number; // kobo (from Paystack)
    metadata?: {
      custom_fields?: Array<{ variable_name: string; value: string | number }>;
    };
    authorization?: { customer?: { email?: string } };
    customer?: { email?: string };
  };
};

/**
 * POST /api/webhooks/paystack
 * Paystack sends charge.success etc. with x-paystack-signature (HMAC SHA512 of body).
 * We verify the signature, then for charge.success we credit the user from metadata (user_id, coins)
 * and record in payment_credits to avoid double-credit.
 */
export async function POST(request: NextRequest) {
  if (!PAYSTACK_SECRET) {
    logger.error("Paystack webhook", "PAYSTACK_SECRET_KEY not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const signature = request.headers.get("x-paystack-signature") ?? "";
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  const validSignature =
    signature.length === hash.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  if (!validSignature) {
    logger.warn("Paystack webhook", "Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const ref = event.data?.reference;
  const metadata = event.data?.metadata;
  const customFields = metadata?.custom_fields ?? [];
  const getField = (name: string) => {
    const f = customFields.find((c) => c.variable_name === name);
    return f?.value;
  };
  const userId = getField("user_id");

  if (!ref || typeof userId !== "string" || userId.trim() === "") {
    logger.warn("Paystack webhook", "charge.success missing reference or user_id in metadata");
    return NextResponse.json({ received: true });
  }

  // Derive coins from Paystack amount (kobo) only — never trust client/metadata for amount
  const amountKobo = Number(event.data?.amount);
  const coins = Number.isFinite(amountKobo) && amountKobo > 0
    ? Math.floor(amountKobo / KOBOS_PER_COIN)
    : 0;
  if (coins <= 0) {
    logger.warn("Paystack webhook", "charge.success invalid or zero amount", { amountKobo });
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("payment_credits")
    .select("id")
    .eq("reference", ref)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, already_credited: true });
  }

  const { error: insertCreditError } = await supabase.from("payment_credits").insert({
    reference: ref,
    player_id: userId.trim(),
    amount_coins: coins,
  });

  if (insertCreditError) {
    if (insertCreditError.code === "23505") {
      return NextResponse.json({ received: true, already_credited: true });
    }
    logger.error("Paystack webhook", "payment_credits insert failed", { err: insertCreditError });
    return NextResponse.json({ error: "Failed to record credit" }, { status: 500 });
  }

  const { data: profile, error: fetchError } = await supabase
    .from("player_profiles")
    .select("credits")
    .eq("user_id", userId.trim())
    .single();

  if (fetchError || !profile) {
    logger.error("Paystack webhook", "profile not found for credited user", { err: fetchError });
    return NextResponse.json({ received: true });
  }

  const current = Number(profile.credits) || 0;
  const newCredits = current + coins;

  const { error: updateError } = await supabase
    .from("player_profiles")
    .update({ credits: newCredits })
    .eq("user_id", userId.trim());

  if (updateError) {
    logger.error("Paystack webhook", "failed to update credits", { err: updateError });
    return NextResponse.json({ error: "Failed to update wallet" }, { status: 500 });
  }

  return NextResponse.json({ received: true, credited: coins });
}
