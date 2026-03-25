import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRequestBodySize } from "@/lib/request-utils";
import { logger } from "@/lib/logger";
import { formatLootaNumberSuffix } from "@/lib/loota-username";

const USERNAME_MAX_LENGTH = 50;
/** Allowed: letters, digits, spaces, hyphens, underscores, apostrophe (e.g. O'Brien) */
const USERNAME_ALLOWED = /^[\w\s\-']+$/;

function generateAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

function validateUsername(value: string): { ok: true; username: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, error: "Username cannot be empty" };
  if (trimmed.length > USERNAME_MAX_LENGTH) return { ok: false, error: `Username must be at most ${USERNAME_MAX_LENGTH} characters` };
  if (!USERNAME_ALLOWED.test(trimmed)) return { ok: false, error: "Username can only contain letters, numbers, spaces, hyphens, underscores and apostrophe" };
  return { ok: true, username: trimmed };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current user from the session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const sizeCheck = checkRequestBodySize(request);
    if (sizeCheck) return sizeCheck;

    const body = await request.json().catch(() => ({}));
    const rawUsername = body && typeof body.username === "string" ? body.username : "";

    const avatarUrl = generateAvatarUrl(user.id);
    let finalUsername: string;
    if (rawUsername.trim() !== "") {
      const validated = validateUsername(rawUsername);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      finalUsername = validated.username;
    } else {
      const n = randomInt(1, 1_000_000_000);
      finalUsername = `Loota_${formatLootaNumberSuffix(n)}`;
    }

    // Create player profile with avatar and 1000 free coins
    const { data: profile, error: profileError } = await supabase
      .from("player_profiles")
      .insert({
        user_id: user.id,
        username: finalUsername,
        credits: 1000,
        level: 1,
        avatar_url: avatarUrl,
      })
      .select()
      .single();

    if (profileError) {
      logger.error("create-profile", "Profile creation/update error", { err: profileError });
      
      // If profile already exists, update only username and avatar (do not overwrite credits)
      if (profileError.code === "23505") {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("player_profiles")
          .update({
            username: finalUsername,
            avatar_url: avatarUrl,
          })
          .eq("user_id", user.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json(
            { error: "Failed to update profile" },
            { status: 500 }
          );
        }

        return NextResponse.json({ profile: updatedProfile });
      }

      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    logger.error("create-profile", "Unexpected error", { err: error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
