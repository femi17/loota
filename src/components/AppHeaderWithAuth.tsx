"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { AppHeader, type AppNavKey } from "./AppHeader";
import type { ReactNode } from "react";

type Props = {
  active: AppNavKey;
  tokens?: string;
  tokensIcon?: string;
  variant?: "page" | "overlay";
  rightSlot?: ReactNode;
  onMapClick?: () => void;
  onProfileClick?: () => void;
};

export function AppHeaderWithAuth({
  active,
  tokens,
  tokensIcon = "people",
  variant = "page",
  rightSlot,
  onMapClick,
  onProfileClick,
}: Props) {
  const { user, profile, loading } = useAuth();
  const [totalUsers, setTotalUsers] = useState<string>("0");

  // Format credits with commas
  const credits = profile?.credits
    ? profile.credits.toLocaleString(undefined, {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      })
    : "0";

  // Get username from profile or user email
  const username = profile?.username || user?.email?.split("@")[0] || "Player";

  // Get subtitle (level info)
  const subtitle = profile?.level
    ? `Level ${profile.level} Loota`
    : "New Player";

  // Get avatar URL from profile or generate default
  const avatarUrl =
    profile?.avatar_url ||
    (user?.id
      ? `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(user.id)}`
      : undefined);

  // Fetch total user count
  useEffect(() => {
    async function fetchUserCount() {
      try {
        const { count, error } = await supabase
          .from("player_profiles")
          .select("*", { count: "exact", head: true });

        if (!error && count !== null) {
          setTotalUsers(count.toLocaleString());
        }
      } catch (error) {
        console.error("Error fetching user count:", error);
      }
    }

    fetchUserCount();
  }, []);

  // Default to total users count if tokens not provided
  const tokensDisplay = tokens || totalUsers;

  return (
    <AppHeader
      active={active}
      credits={credits}
      tokens={tokensDisplay}
      tokensIcon={tokensIcon}
      username={username}
      subtitle={subtitle}
      avatarUrl={avatarUrl}
      variant={variant}
      rightSlot={rightSlot}
      onMapClick={onMapClick}
      onProfileClick={onProfileClick}
    />
  );
}
