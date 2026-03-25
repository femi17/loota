"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { getClientId } from "@/lib/client-id";

const HEARTBEAT_INTERVAL_MS = 4000;
const STALE_MS = 15000;
const COMPETING_WINDOW_MS = 20000;

/**
 * Detects when the same user is signed in on 2+ browsers. When true, show
 * "Multiple logins detected. Please close one of your sessions."
 */
export function useMultiLoginDetect(userId: string | undefined) {
  const [multipleLoginsDetected, setMultipleLoginsDetected] = useState(false);

  useEffect(() => {
    if (!userId) {
      setMultipleLoginsDetected(false);
      return;
    }

    const interval = setInterval(async () => {
      const clientId = getClientId();
      const { data, error } = await supabase.rpc("claim_user_session", {
        p_user_id: userId,
        p_client_id: clientId,
        p_stale_ms: STALE_MS,
        p_competing_window_ms: COMPETING_WINDOW_MS,
      });

      if (error) {
        console.warn("[useMultiLoginDetect] claim_user_session error", error);
        return;
      }

      const claimed = data?.claimed === true;
      const anotherSeen = data?.another_device_seen === true;
      setMultipleLoginsDetected(!claimed || anotherSeen);
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [userId]);

  return { multipleLoginsDetected };
}
