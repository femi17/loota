"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type ActiveHuntRow = {
  id: string;
  keys_to_win: number;
  start_date: string;
  end_date?: string | null;
  pricing_config?: { paystackMode?: "free" | "paid" } | null;
  region_name: string | null;
  waypoints: Array<{ label: string; lng: number; lat: number }> | null;
  questions: Array<{
    question: string;
    answer: string;
    options?: string[];
    category: string;
    difficulty: string;
  }>;
  question_categories: string[] | null;
};

export type UseHuntDataResult = {
  activeHunt: ActiveHuntRow | null;
  setActiveHunt: React.Dispatch<React.SetStateAction<ActiveHuntRow | null>>;
  activeHuntId: string | null;
  setActiveHuntId: React.Dispatch<React.SetStateAction<string | null>>;
  isRegisteredForHunt: boolean | null;
  setIsRegisteredForHunt: React.Dispatch<React.SetStateAction<boolean | null>>;
  secondsUntilStart: number | null;
  /** Seconds until end_date; null if hunt has no end_date. */
  secondsUntilEnd: number | null;
  huntFetchDone: boolean;
  huntHasStarted: boolean;
  /** True when end_date exists and current time is past it (schedule only; hunt row may still be active until finalized). */
  huntHasEnded: boolean;
};

/**
 * Fetches the current active hunt, registration status, and countdown.
 * Redirects to /lobby when no active hunt or user not registered.
 */
export function useHuntData(userId: string | undefined): UseHuntDataResult {
  const router = useRouter();
  const [activeHunt, setActiveHunt] = useState<ActiveHuntRow | null>(null);
  const [activeHuntId, setActiveHuntId] = useState<string | null>(null);
  const [isRegisteredForHunt, setIsRegisteredForHunt] = useState<boolean | null>(null);
  const [secondsUntilStart, setSecondsUntilStart] = useState<number | null>(null);
  const [secondsUntilEnd, setSecondsUntilEnd] = useState<number | null>(null);
  const [huntFetchDone, setHuntFetchDone] = useState(false);
  const finalizeCalledRef = useRef<string | null>(null);

  useEffect(() => {
    finalizeCalledRef.current = null;
  }, [activeHuntId]);

  // Fetch active hunt (id, keys_to_win, questions, start_date, waypoints, etc.)
  useEffect(() => {
    supabase
      .from("hunts")
      .select(
        "id, keys_to_win, start_date, end_date, pricing_config, region_name, waypoints, questions, question_categories"
      )
      .eq("status", "active")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then((result: { data: ActiveHuntRow | null }) => {
        const row = result.data ?? null;
        setActiveHunt(row);
        setActiveHuntId(row?.id ?? null);
        setHuntFetchDone(true);
      });
  }, []);

  // When no active hunt, redirect to lobby
  useEffect(() => {
    if (!huntFetchDone || activeHuntId !== null) return;
    router.replace("/lobby");
  }, [huntFetchDone, activeHuntId, router]);

  // Only registered users can use hunts page; others redirect to lobby
  useEffect(() => {
    if (!userId || activeHuntId == null) return;
    let cancelled = false;
    supabase
      .from("hunt_registrations")
      .select("id")
      .eq("hunt_id", activeHuntId)
      .eq("player_id", userId)
      .maybeSingle()
      .then((result: { data: { id: string } | null }) => {
        if (cancelled) return;
        const registered = !!result.data;
        setIsRegisteredForHunt(registered);
        if (!registered) router.replace("/lobby");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, activeHuntId, router]);

  // Countdown until hunt start
  useEffect(() => {
    if (!activeHunt?.start_date) return;
    const update = () => {
      const start = new Date(activeHunt.start_date).getTime();
      const now = Date.now();
      setSecondsUntilStart(Math.max(0, Math.floor((start - now) / 1000)));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [activeHunt?.start_date]);

  // Countdown until hunt end (by schedule)
  useEffect(() => {
    if (!activeHunt?.end_date) {
      setSecondsUntilEnd(null);
      return;
    }
    const update = () => {
      const end = new Date(activeHunt.end_date as string).getTime();
      if (!Number.isFinite(end)) {
        setSecondsUntilEnd(null);
        return;
      }
      const now = Date.now();
      setSecondsUntilEnd(Math.max(0, Math.floor((end - now) / 1000)));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [activeHunt?.end_date]);

  const huntHasStarted = secondsUntilStart != null && secondsUntilStart <= 0;
  const huntHasEnded =
    activeHunt?.end_date != null &&
    secondsUntilEnd != null &&
    secondsUntilEnd <= 0;

  // When the schedule says the hunt has ended, finalize once (marks completed + records winners).
  useEffect(() => {
    if (!huntHasEnded || !activeHuntId) return;
    if (finalizeCalledRef.current === activeHuntId) return;
    finalizeCalledRef.current = activeHuntId;
    void fetch("/api/hunt/finalize-hunt-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hunt_id: activeHuntId }),
    });
  }, [huntHasEnded, activeHuntId]);

  return {
    activeHunt,
    setActiveHunt,
    activeHuntId,
    setActiveHuntId,
    isRegisteredForHunt,
    setIsRegisteredForHunt,
    secondsUntilStart,
    secondsUntilEnd,
    huntFetchDone,
    huntHasStarted,
    huntHasEnded,
  };
}
