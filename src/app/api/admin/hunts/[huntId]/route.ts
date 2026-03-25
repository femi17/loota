import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";

/**
 * GET /api/admin/hunts/[huntId]
 * Returns hunt by id for admin (live-view, broadcast). Uses server session so RLS sees admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ huntId: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { huntId } = await params;
  if (!huntId?.trim()) {
    return NextResponse.json({ error: "huntId required" }, { status: 400 });
  }

  const { supabase } = auth;

  const { data: hunt, error } = await supabase
    .from("hunts")
    .select("id, title, keys_to_win, waypoints, status")
    .eq("id", huntId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not load hunt" },
      { status: 500 }
    );
  }

  if (!hunt) {
    return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
  }

  const status = (hunt.status ?? "").toString().toLowerCase();
  if (status !== "active" && status !== "draft") {
    return NextResponse.json(
      { error: "This hunt has ended or is not available" },
      { status: 400 }
    );
  }

  return NextResponse.json(hunt);
}
