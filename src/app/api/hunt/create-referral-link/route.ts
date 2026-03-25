import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";

/**
 * POST /api/hunt/create-referral-link
 * Creates a one-time referral token for the active hunt and returns the invite URL.
 * The link contains the token; when the referred user visits, we resolve token -> referrer server-side.
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

  const { data: row, error } = await supabase
    .from("referral_tokens")
    .insert({
      hunt_id: activeHunt.id,
      referrer_id: user.id,
    })
    .select("id")
    .single();

  if (error || !row?.id) {
    return NextResponse.json({ error: "Failed to create referral link" }, { status: 500 });
  }

  let baseUrl: string;
  try {
    baseUrl = new URL(request.url).origin;
  } catch {
    baseUrl = "";
  }
  const url = baseUrl ? `${baseUrl}/lobby?ref=${row.id}` : `/lobby?ref=${row.id}`;

  return NextResponse.json({ token: row.id, url });
}
