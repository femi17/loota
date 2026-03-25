import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/hunt/record-referral
 * Called when the user lands on /lobby?ref=XXX. Records that this user was referred by
 * the referrer implied by XXX: if XXX is a token (in referral_tokens), use that referrer_id;
 * otherwise treat XXX as legacy referrer_id (for backward compatibility).
 * Body: { ref: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  let body: { ref?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ref = typeof body?.ref === "string" ? body.ref.trim() : "";
  if (!ref) {
    return NextResponse.json({ error: "ref is required" }, { status: 400 });
  }

  if (!UUID_REGEX.test(ref)) {
    return NextResponse.json({ error: "Invalid ref format" }, { status: 400 });
  }

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

  let referrerId: string;

  const { data: tokenRow } = await supabase
    .from("referral_tokens")
    .select("referrer_id")
    .eq("id", ref)
    .eq("hunt_id", activeHunt.id)
    .maybeSingle();

  if (tokenRow?.referrer_id) {
    referrerId = tokenRow.referrer_id;
  } else {
    referrerId = ref;
  }

  if (referrerId === user.id) {
    return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
  }

  await supabase.from("pending_hunt_referrals").upsert(
    {
      hunt_id: activeHunt.id,
      referrer_id: referrerId,
      referred_id: user.id,
      created_at: new Date().toISOString(),
    },
    { onConflict: "hunt_id,referred_id" }
  );

  return NextResponse.json({ ok: true });
}
