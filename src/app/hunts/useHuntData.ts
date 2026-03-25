"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type ActiveHuntRow = {
  id: string;
  keys_to_win: number;
  start_date: string;
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
  huntFetchDone: boolean;
  huntHasStarted: boolean;
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
  const [huntFetchDone, setHuntFetchDone] = useState(false);

  // Fetch active hunt (id, keys_to_win, questions, start_date, waypoints, etc.)
  useEffect(() => {
    supabase
      .from("hunts")
      .select("id, keys_to_win, start_date, region_name, waypoints, questions, question_categories")
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

  const huntHasStarted = secondsUntilStart != null && secondsUntilStart <= 0;

  return {
    activeHunt,
    setActiveHunt,
    activeHuntId,
    setActiveHuntId,
    isRegisteredForHunt,
    setIsRegisteredForHunt,
    secondsUntilStart,
    huntFetchDone,
    huntHasStarted,
  };
}
