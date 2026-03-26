import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { checkRequestBodySize } from "@/lib/request-utils";

const PAYSTACK_SECRET_FREE = process.env.PAYSTACK_SECRET_KEY ?? "";
const PAYSTACK_SECRET_PAID = process.env.PAID_PAYSTACK_SECRET_KEY ?? "";
/** Kobo per coin. 50 = 0.5 NGN per coin (N1000 → 2000 coins, N2500 → 5000, N5000 → 10000). */
const KOBOS_PER_COIN = Math.max(1, Number(process.env.PAYSTACK_KOBOS_PER_COIN) || 50);

type PaystackVerifyResponse = {
  status: boolean;
  data?: {
    status: string;
    reference: string;
    amount: number;
    customer?: { email?: string };
    metadata?: {
      custom_fields?: Array<{ variable_name: string; value: string | number }>;
    };
  };
};

function getCustomFieldValue(
  fields: Array<{ variable_name: string; value: string | number }> | undefined,
  name: string
): string {
  const hit = fields?.find((f) => f.variable_name === name)?.value;
  return typeof hit === "string" || typeof hit === "number" ? String(hit).trim() : "";
}

/**
 * POST /api/wallet/add-coins
 * Credits the current user after verifying the Paystack transaction server-side.
 * Body: { reference: string } — the Paystack transaction reference from the payment.
 * Verifies with Paystack API, ensures customer email matches the logged-in user,
 * then credits once (idempotent via payment_credits table).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  if (!PAYSTACK_SECRET_FREE && !PAYSTACK_SECRET_PAID) {
    return NextResponse.json({ error: "Payment verification not configured" }, { status: 503 });
  }

  const sizeCheck = checkRequestBodySize(request);
  if (sizeCheck) return sizeCheck;

  let body: { reference?: string; paystackMode?: "free" | "paid" | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  const mode = body?.paystackMode === "paid" ? "paid" : "free";
  const PAYSTACK_SECRET = mode === "paid" ? PAYSTACK_SECRET_PAID : PAYSTACK_SECRET_FREE;
  if (!PAYSTACK_SECRET) {
    return NextResponse.json(
      { error: mode === "paid" ? "Paid Paystack not configured" : "Paystack not configured" },
      { status: 503 }
    );
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      cache: "no-store",
    }
  );

  if (!verifyRes.ok) {
    return NextResponse.json(
      { error: "Could not verify payment" },
      { status: 400 }
    );
  }

  const verify = (await verifyRes.json()) as PaystackVerifyResponse;
  if (!verify.status || verify.data?.status !== "success") {
    return NextResponse.json({ error: "Transaction not successful" }, { status: 400 });
  }

  const data = verify.data!;
  const customerEmail = (data.customer?.email ?? "").trim().toLowerCase();
  const userEmail = (user.email ?? "").trim().toLowerCase();
  const metadataUserId = getCustomFieldValue(data.metadata?.custom_fields, "user_id");

  // Strong binding: transaction must carry the same user_id in Paystack metadata.
  if (!metadataUserId || metadataUserId !== user.id) {
    return NextResponse.json({ error: "Payment does not belong to this user" }, { status: 403 });
  }

  if (customerEmail && userEmail && customerEmail !== userEmail) {
    return NextResponse.json({ error: "Payment was made with a different email" }, { status: 403 });
  }

  // Derive coins from Paystack verified amount (kobo) only — never trust client/metadata for amount
  const amountKobo = Number(data.amount);
  const coins =
    Number.isFinite(amountKobo) && amountKobo > 0
      ? Math.floor(amountKobo / KOBOS_PER_COIN)
      : 0;
  if (coins <= 0) {
    return NextResponse.json(
      { error: "Transaction amount too low to credit" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("payment_credits")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    const { data: profile } = await supabase
      .from("player_profiles")
      .select("credits")
      .eq("user_id", user.id)
      .single();
    return NextResponse.json({
      newCredits: Number(profile?.credits ?? 0),
      already_credited: true,
    });
  }

  const { error: insertError } = await supabase.from("payment_credits").insert({
    reference,
    player_id: user.id,
    amount_coins: coins,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: profile } = await supabase
        .from("player_profiles")
        .select("credits")
        .eq("user_id", user.id)
        .single();
      return NextResponse.json({
        newCredits: Number(profile?.credits ?? 0),
        already_credited: true,
      });
    }
    return NextResponse.json({ error: "Failed to record credit" }, { status: 500 });
  }

  const { data: profile, error: fetchError } = await supabase
    .from("player_profiles")
    .select("credits")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const current = Number(profile.credits) || 0;
  const newCredits = current + coins;

  const { error: updateError } = await supabase
    .from("player_profiles")
    .update({ credits: newCredits })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update wallet" }, { status: 500 });
  }

  // Audit trail: log transaction for wallet top-up
  await supabase.from("transactions").insert({
    player_id: user.id,
    hunt_id: null,
    transaction_type: "wallet_topup",
    amount: coins,
    description: "Paystack top-up",
    item_id: null,
    metadata: { reference },
  });

  return NextResponse.json({ newCredits });
}
