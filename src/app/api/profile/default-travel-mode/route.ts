import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";

const VALID_MODE_IDS = ["walk", "bicycle", "motorbike", "car", "bus", "plane"] as const;
const INVENTORY_TO_HUNTS: Record<string, string> = {
  walk: "walk",
  bicycle: "bicycle",
  motorbike: "motorbike",
  car: "car",
  bus_pass: "bus",
  air_taxi: "plane",
  bus: "bus",
  plane: "plane",
};

/**
 * PATCH /api/profile/default-travel-mode
 * Body: { modeId: string } — inventory or hunts style (bus_pass/air_taxi normalized to bus/plane).
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  let body: { modeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body?.modeId === "string" ? body.modeId.trim() : "";
  const modeId = INVENTORY_TO_HUNTS[raw] ?? (VALID_MODE_IDS.includes(raw as any) ? raw : null);
  if (!modeId || !VALID_MODE_IDS.includes(modeId as any)) {
    return NextResponse.json({ error: "Invalid mode ID" }, { status: 400 });
  }

  const { error } = await supabase
    .from("player_profiles")
    .update({ default_travel_mode: modeId })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update default travel mode" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, default_travel_mode: modeId });
}
