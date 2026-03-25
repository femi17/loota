"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { getClientId } from "@/lib/client-id";
import { supabase } from "@/lib/supabase/client";
import {
  BUS_FARE_BASE,
  BUS_FARE_CAP,
  BUY_COST,
  formatNaira,
  formatCoins,
  getPickupSeconds,
  LOW_FUEL_WARN_PCT,
  RENT_CAP,
  RENT_FROM,
} from "@/lib/travel-config";
import type {
  LngLat,
  DrawerId,
  LightPreset,
  TaskCategoryId,
  TaskItem,
  TaskStage,
  TravelModeId,
  TravelMode,
  RpsMove,
  HuntPhase,
  VehicleId,
  TravelOffer,
  ConsequenceFlow,
} from "../types";
import {
  DEMO_TRAVEL_SPEED_KMH,
  ARRIVAL_RADIUS_KM,
  SIM_SPEEDUP,
  PREP_WALK_SPEEDUP,
  STOP_SPEEDUP,
  STOP_SPEEDUP_REST_IN_PLACE,
  PLANE_MIN_KM,
  PLANE_BOARDING_MINUTES,
  PLANE_DISEMBARKING_MINUTES,
  TASK_TIME_SECONDS,
  CHEAT_LOCKED_DESTINATION_MATCH_KM,
  NIGERIA_BBOX,
  TASK_CATEGORY_ORDER,
  TASK_CATEGORY_LABEL,
  TASK_BANK,
  WALK_REJUVENATE_EVERY_KM,
  BIKE_REJUVENATE_EVERY_KM,
  MOTO_REFUEL_EVERY_KM,
  CAR_REFUEL_EVERY_KM,
  DRIVE_REST_EVERY_KM,
  BUS_STOP_EVERY_KM,
  BUS_STOP_SECONDS,
  COST_REJUVENATE_WALK,
  COST_REJUVENATE_BIKE,
  COST_REFUEL_MOTO,
  COST_REFUEL_CAR,
  COST_REST_DRIVE,
  REJUVENATE_MAX_DISTANCE_KM,
  REJUVENATE_MAX_DISTANCE_M,
  REST_IN_PLACE_SECONDS,
  REJUVENATE_KM_BONUS_AFTER_VENUE,
  VEHICLE_IDS,
  MAINT_WARN_PCT,
  MAINT_WORLD_SECONDS,
  REPAIR_WORLD_SECONDS,
  MAINT_SPEEDUP,
  MAINTENANCE_TASKS,
  VEHICLE_WEAR_PCT_PER_KM,
  MAINT_COST,
  TOW_COST,
  TRAVEL_MODES,
  HOSPITAL_STAY_MINUTES,
  HOSPITAL_BILL,
  AMBULANCE_ARRIVAL_MS,
  BICYCLE_RECOVERY_REPAIR_COST_OWNED,
  BICYCLE_RECOVERY_REPAIR_COST_RENTAL,
  BICYCLE_RECOVERY_REPAIR_DURATION_MS,
} from "../constants";
import {
  lightPresetForLocalTime,
  fmtCoord,
  clamp,
  normAnswer,
  hash32,
  mulberry32,
  taskCategoryForStep,
  pickTask,
  arrivalRankFor,
  haversineKm,
  bearingDeg,
  ordinal,
  destinationPointFromBearing,
  isLngLatInNigeria,
  parseWaypointCoords,
  shortenPlaceLabel,
} from "../utils";
import { HuntsNavButtons } from "@/components/hunts/HuntsNavButtons";
import { HuntsToast } from "@/components/hunts/HuntsToast";
import { HuntsTravelHud } from "@/components/hunts/HuntsTravelHud";
import { HuntsBottomHud } from "@/components/hunts/HuntsBottomHud";
import { HuntsDrawerShell } from "@/components/hunts/HuntsDrawerShell";
import { HuntsLeaderboardDrawerContent } from "@/components/hunts/HuntsLeaderboardDrawerContent";
import { HuntsDestinationDrawerContent } from "@/components/hunts/HuntsDestinationDrawerContent";
import { HuntsConstraintDrawerContent } from "@/components/hunts/HuntsConstraintDrawerContent";
import { HuntsHospitalDrawerContent } from "@/components/hunts/HuntsHospitalDrawerContent";
import { HuntsBreakdownDrawerContent } from "@/components/hunts/HuntsBreakdownDrawerContent";
import { HuntsStatusDrawerContent } from "@/components/hunts/HuntsStatusDrawerContent";
import { HuntsGarageDrawerContent } from "@/components/hunts/HuntsGarageDrawerContent";
import { HuntsTravelDrawerContent } from "@/components/hunts/HuntsTravelDrawerContent";
import { HuntsPlaneDrawerContent } from "@/components/hunts/HuntsPlaneDrawerContent";
import { HuntsInventoryDrawerContent } from "@/components/hunts/HuntsInventoryDrawerContent";
import { HuntsCoinsDrawerContent } from "@/components/hunts/HuntsCoinsDrawerContent";
import { HuntsCountdownOverlay } from "@/components/hunts/HuntsCountdownOverlay";
import { HuntsStopGatewayButton } from "@/components/hunts/HuntsStopGatewayButton";
import {
  makeAvatarEl,
  makeAmbulanceEl,
  makeAmbulanceWithAvatarEl,
  makeDestinationPinEl,
  makePickupVehicleEl,
} from "../mapMarkerFactories";
import { useHuntData } from "../useHuntData";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
const CONSTRAINT_PENDING_KEY = "loota_constraint_to_stop";
const HOSPITAL_PENDING_KEY = "loota_hospital_pending";

function readPendingHospitalHuntId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HOSPITAL_PENDING_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { huntId?: string };
    return typeof d.huntId === "string" ? d.huntId : null;
  } catch {
    return null;
  }
}

function readConstraintPendingForQuizBlock(
  huntId: string | null
): { pending: boolean; stopCenter: [number, number] | null; restInPlace: boolean } {
  if (typeof window === "undefined" || !huntId) {
    return { pending: false, stopCenter: null, restInPlace: false };
  }
  try {
    const raw = window.sessionStorage.getItem(CONSTRAINT_PENDING_KEY);
    if (!raw) return { pending: false, stopCenter: null, restInPlace: false };
    const d = JSON.parse(raw) as {
      huntId?: string;
      status?: string;
      restInPlace?: boolean;
      stop?: { center?: [number, number] };
    };
    if (d.huntId !== huntId) return { pending: false, stopCenter: null, restInPlace: false };
    const st = String(d.status || "");
    const pending =
      st === "finding" || st === "to_stop" || st === "relaxing" || st === "ready_to_pay";
    const c = d.stop?.center;
    const stopCenter =
      Array.isArray(c) && c.length >= 2 ? ([Number(c[0]), Number(c[1])] as [number, number]) : null;
    return { pending, stopCenter, restInPlace: Boolean(d.restInPlace) };
  } catch {
    return { pending: false, stopCenter: null, restInPlace: false };
  }
}

/** Return type is intentionally `any` so the page can destructure 200+ values without a giant interface; hook is internal to hunts. */
export function useHuntsCore(): any {
  const tokenPresent = Boolean(MAPBOX_TOKEN);
  const youName = "Cipher_Player";
  const taskSeedRef = useRef<number>(0);
  function getTaskSeed() {
    if (taskSeedRef.current) return taskSeedRef.current;
    // Lazy-init on the client (avoid SSR hydration mismatch).
    if (typeof window !== "undefined") {
      const key = "loota_task_seed_v1";
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        taskSeedRef.current = parsed;
        return taskSeedRef.current;
      }
      const seed = (Math.random() * 0x7fffffff) >>> 0;
      taskSeedRef.current = seed || 1;
      window.localStorage.setItem(key, String(taskSeedRef.current));
      return taskSeedRef.current;
    }
    taskSeedRef.current = 1;
    return taskSeedRef.current;
  }
  const { user, profile, refreshProfile, updateCredits } = useAuth();
  const [credits, setCredits] = useState<number>(0);
  const [huntersHunting, setHuntersHunting] = useState<number>(0);
  /** When non-null, multi-device modal is shown. "secondary" = other device (you are travelling already); "primary" = this device is travelling (close the other). */
  const [otherDeviceRole, setOtherDeviceRole] = useState<"secondary" | "primary" | null>(null);
  const anotherDeviceActive = otherDeviceRole !== null;
  const [lightPreset, setLightPreset] = useState<LightPreset>(() =>
    lightPresetForLocalTime(),
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const youMarkerRef = useRef<any>(null);
  const lastCameraEaseAtRef = useRef(0);
  const prevMovePosRef = useRef<LngLat | null>(null);
  const lastMoveBearingRef = useRef<number>(0);
  const activeHuntIdRef = useRef<string | null>(null);
  const huntHasStartedRef = useRef(false);
  const setLocatorUsedThisHuntRef = useRef<(v: boolean) => void>(() => {});

  const [mapReady, setMapReady] = useState(false);
  /** Once the user uses the locator after the hunt has started, hide it for this hunt (persisted per hunt_id). New hunt = show again. */
  const [locatorUsedThisHunt, setLocatorUsedThisHunt] = useState(false);
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const resumeDrawerRef = useRef<DrawerId>(null);
  /** Notifications per nav icon: when true, show badge/effect so user checks that panel (e.g. first key, winner key, maintenance, destination ready). */
  const [navNotifications, setNavNotifications] = useState<{
    travel: boolean;
    inventory: boolean;
    garage: boolean;
    leaderboard: boolean;
    status: boolean;
  }>({ travel: false, inventory: false, garage: false, leaderboard: false, status: false });
  const [shopError, setShopError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paystackLoading, setPaystackLoading] = useState(false);

  /** Per-hunt leaderboard: real data from player_positions + hunt_registrations. Rank by keys then loota. */
  const [huntLeaderboard, setHuntLeaderboard] = useState<{
    list: Array<{
      id: string;
      name?: string;
      avatarUrl?: string;
      keys: number;
      loota: number;
      inventory: string[];
      currentMode: string;
      traveling: boolean;
      you: boolean;
    }>;
    rank: number;
  } | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const initialCreditsRef = useRef<number | null>(null);

  // Sync wallet balance from profile (real data)
  useEffect(() => {
    if (profile?.credits != null) {
      const value = Number(profile.credits);
      if (Number.isFinite(value)) {
        if (initialCreditsRef.current === null) initialCreditsRef.current = value;
        setCredits(value);
      }
    }
  }, [profile?.credits]);

  // Fetch real user count (player_profiles)
  const fetchUserCount = useCallback(async () => {
    if (!supabase) return;
    const { count, error } = await supabase
      .from("player_profiles")
      .select("*", { count: "exact", head: true });
    if (!error && count != null) setHuntersHunting(count);
  }, []);

  useEffect(() => {
    fetchUserCount();
  }, [fetchUserCount]);

  // When modal/drawer opens, refetch user count so menu shows latest
  useEffect(() => {
    if (!drawer) return;
    fetchUserCount();
  }, [drawer, fetchUserCount]);

  // Clear nav notification when user opens that drawer (they've "seen" it)
  useEffect(() => {
    if (!drawer) return;
    setNavNotifications((prev) => {
      const next = { ...prev };
      if (drawer === "travel") next.travel = false;
      if (drawer === "inventory") next.inventory = false;
      if (drawer === "garage") next.garage = false;
      if (drawer === "leaderboard") next.leaderboard = false;
      if (drawer === "status") next.status = false;
      return next;
    });
  }, [drawer]);

  // Active hunt data: fetch, registration, countdown (redirects to lobby when no hunt or not registered)
  const {
    activeHunt,
    setActiveHunt,
    activeHuntId,
    setActiveHuntId,
    isRegisteredForHunt,
    secondsUntilStart,
    huntFetchDone,
    huntHasStarted,
  } = useHuntData(user?.id);

  activeHuntIdRef.current = activeHuntId;
  huntHasStartedRef.current = huntHasStarted;
  setLocatorUsedThisHuntRef.current = setLocatorUsedThisHunt;

  // Warn when closing/refreshing during an active hunt (cannot block; progress is saved)
  useEffect(() => {
    if (!huntHasStarted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Leave hunt? Your progress is saved.";
      return "Leave hunt? Your progress is saved.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [huntHasStarted]);

  // Sync "locator used this hunt" from localStorage (so after refresh/navigate back we still hide the button)
  // Check localStorage even before hunt starts — user may have used locator during countdown.
  useEffect(() => {
    if (!activeHuntId) {
      setLocatorUsedThisHunt(false);
      return;
    }
    try {
      const key = `loota_locator_used_${activeHuntId}`;
      setLocatorUsedThisHunt(typeof window !== "undefined" && window.localStorage.getItem(key) === "1");
    } catch {
      setLocatorUsedThisHunt(false);
    }
  }, [activeHuntId]);

  const deductCredits = useCallback(
    async (amount: number, huntId?: string | null): Promise<number | null> => {
      if (amount <= 0) return credits;
      try {
        // Only attach hunt_id when we know the user is registered (or caller passed an explicit id).
        // Sending activeHuntId before hunt_registrations is loaded caused RPC "Not registered" → HTTP 403.
        const resolvedHuntId =
          huntId !== undefined && huntId !== null
            ? huntId
            : isRegisteredForHunt === true
              ? activeHuntId
              : null;
        const res = await fetch("/api/hunt/deduct-credits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            ...(resolvedHuntId ? { hunt_id: resolvedHuntId } : {}),
          }),
        });
        const data = (await res.json()) as { newCredits?: number; error?: string };
        if (!res.ok) {
          setToast({ title: "Error", message: data?.error || "Failed to deduct credits" });
          return null;
        }
        const newCredits = data.newCredits;
        if (typeof newCredits !== "number") return null;
        setCredits(newCredits);
        updateCredits?.(newCredits);
        refreshProfile?.();
        return newCredits;
      } catch {
        setToast({ title: "Error", message: "Failed to sync wallet" });
        return null;
      }
    },
    [credits, activeHuntId, isRegisteredForHunt, refreshProfile, updateCredits]
  );

  const [keys, setKeys] = useState(0);
  /** After player_positions row is loaded for this hunt — avoids races where UI assumes public_trip/keys=0 before DB restore. */
  const [playerPositionsHydrated, setPlayerPositionsHydrated] = useState(false);
  const keysToWin = activeHunt?.keys_to_win ?? 20;
  const [huntPhase, setHuntPhase] = useState<HuntPhase>("public_trip");
  const [publicTaskAnswer, setPublicTaskAnswer] = useState("");
  const [publicTaskError, setPublicTaskError] = useState<string | null>(null);
  const [publicTaskFeedback, setPublicTaskFeedback] = useState<string | null>(null);
  const publicTaskStepNumber = 1;
  const [publicTaskStage, setPublicTaskStage] = useState<TaskStage>("intro");
  const [publicTaskAttempt, setPublicTaskAttempt] = useState(0);
  const [publicTaskQuestion, setPublicTaskQuestion] = useState<TaskItem | null>(null);
  const [publicTaskDeadlineMs, setPublicTaskDeadlineMs] = useState<number | null>(null);
  const publicTaskTimedOutRef = useRef(false);

  const [unlockAnswer, setUnlockAnswer] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockTaskFeedback, setUnlockTaskFeedback] = useState<string | null>(null);
  const [unlockTaskStage, setUnlockTaskStage] = useState<TaskStage>("intro");
  const [unlockTaskAttempt, setUnlockTaskAttempt] = useState(0);
  const [unlockTaskQuestion, setUnlockTaskQuestion] = useState<TaskItem | null>(null);
  const [unlockTaskDeadlineMs, setUnlockTaskDeadlineMs] = useState<number | null>(null);
  const unlockTaskTimedOutRef = useRef(false);
  const [unlockCheckpoint, setUnlockCheckpoint] = useState<
    null | { to: LngLat; label: string; stepNumber: number }
  >(null);
  const [relocationCountdown, setRelocationCountdown] = useState<number | null>(null);
  /** Shown in status modal when location quiz fails; after delay we reroute and close status. */
  const [locationQuizFailMessage, setLocationQuizFailMessage] = useState<string | null>(null);
  const [unlockRetry, setUnlockRetry] = useState<
    null | { to: LngLat; label: string; stepNumber: number }
  >(null);
  const publicInitRef = useRef(false);
  const [arrivedForChallenge, setArrivedForChallenge] = useState(false);
  const [arrivalChallengeIntro, setArrivalChallengeIntro] = useState(true);
  const [clueUnlocked, setClueUnlocked] = useState(false);
  const [rps, setRps] = useState<{
    your: number;
    bot: number;
    last?: { you: RpsMove; bot: RpsMove; result: "win" | "lose" | "draw" };
    done: boolean;
  } | null>(null);
  const rpsAwardedRef = useRef(false);

  const keysRef = useRef(keys);
  const keysPrevRef = useRef(keys);
  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);
  // Notify leaderboard when this player earns a key. Later: subscribe to realtime (e.g. hunt_registrations.keys_earned)
  // to set leaderboard notification when "first key" is obtained or when the Nth key (winner) is claimed.
  useEffect(() => {
    if (keys > keysPrevRef.current) {
      setNavNotifications((prev) => ({ ...prev, leaderboard: true }));
      keysPrevRef.current = keys;
    } else {
      keysPrevRef.current = keys;
    }
  }, [keys]);

  const huntPhaseRef = useRef(huntPhase);
  useEffect(() => {
    huntPhaseRef.current = huntPhase;
  }, [huntPhase]);
  const clueUnlockedRef = useRef(clueUnlocked);
  useEffect(() => {
    clueUnlockedRef.current = clueUnlocked;
  }, [clueUnlocked]);
  const unlockRetryRef = useRef(unlockRetry);
  useEffect(() => {
    unlockRetryRef.current = unlockRetry;
  }, [unlockRetry]);

  // Waypoints only from DB (created during create-hunt). First waypoint = first quiz location.
  const huntNextLocations = useMemo((): Array<{ label: string; to: LngLat }> => {
    const wp = activeHunt?.waypoints;

    if (Array.isArray(wp) && wp.length > 0) {
      const out: Array<{ label: string; to: LngLat }> = [];
      for (const w of wp) {
        const coords = parseWaypointCoords(w);
        if (coords) {
          const label = (w as { label?: string })?.label ?? "Checkpoint";
          out.push({ label, to: coords as LngLat });
        }
      }
      if (out.length > 0) return out;
    }
    return [];
  }, [activeHunt?.waypoints]);

  // Unlock tasks: from active hunt questions, or placeholders when AI generates at each location
  const demoUnlockTasks = useMemo(() => {
    const qs = activeHunt?.questions;
    const k = activeHunt?.keys_to_win ?? 20;
    const nextLocations = huntNextLocations;
    // Unlock task at index i = at waypoint i+1; after completing it, next destination = waypoint i+2.
    const nextForUnlockIndex = (i: number) => nextLocations[(i + 2) % nextLocations.length];
    if (qs?.length) {
      return qs.map((q, i) => {
        const answers = [q.answer.trim(), ...(q.options ?? [])].map((a) => a.trim()).filter(Boolean);
        const next = nextForUnlockIndex(i);
        return {
          title: "Unlock next destination",
          prompt: q.question,
          answers: answers.length ? answers : [q.answer],
          next: next ? { label: next.label, to: next.to } : null,
        };
      });
    }
    const placeholders = Array.from({ length: k }, (_, i) => {
      const next = nextForUnlockIndex(i);
      return {
        title: "Unlock next destination",
        prompt: "",
        answers: [] as string[],
        next: next ? { label: next.label, to: next.to } : null,
      };
    });
    if (placeholders.length > 0) return placeholders;
    return [
      { title: "Unlock next destination", prompt: "Quick math: 7 + 8 = ?", answers: ["15", "fifteen"], next: nextForUnlockIndex(0) ?? null },
      { title: "Unlock next destination", prompt: "Type the exact word: LOOTA", answers: ["loota"], next: nextForUnlockIndex(1) ?? null },
      { title: "Unlock next destination", prompt: "Riddle: I have keys but no locks.", answers: ["keyboard", "a keyboard"], next: nextForUnlockIndex(2) ?? null },
    ] as const;
  }, [activeHunt?.questions, activeHunt?.keys_to_win, huntNextLocations]);

  const publicTaskFromHunt = useMemo((): TaskItem | null => {
    const first = activeHunt?.questions?.[0];
    if (first) {
      const answers = [first.answer.trim(), ...(first.options ?? [])].map((a) => a.trim()).filter(Boolean);
      return {
        id: "hunt-public-0",
        category: "trivia",
        prompt: first.question,
        answers: answers.length ? answers : [first.answer],
      };
    }
    if (activeHunt && (!activeHunt.questions || activeHunt.questions.length === 0)) {
      return { id: "ai-public-0", category: "trivia", prompt: "", answers: [] };
    }
    return null;
  }, [activeHunt?.questions, activeHunt]);

  // Where to go after completing the public task (first quiz): second waypoint, not the first (current location).
  const firstNextLocation = useMemo((): { label: string; to: LngLat } => {
    const next = huntNextLocations[1] ?? huntNextLocations[0];
    if (next) return next;
    return { label: "Start", to: { lng: 8.5, lat: 9.5 } };
  }, [huntNextLocations]);

  const [travelModeId, setTravelModeId] = useState<TravelModeId>("walk");
  const travelMode = useMemo(
    () => TRAVEL_MODES.find((m) => m.id === travelModeId) ?? TRAVEL_MODES[0],
    [travelModeId],
  );
  const [travelPickModeId, setTravelPickModeId] = useState<TravelModeId>("walk");

  // Map center: neutral Nigeria only. Never used as the user's position â€“ user position comes only from GPS/locator.
  const startLocation = useMemo<LngLat>(() => ({ lng: 8.5, lat: 9.5 }), []);
  // First waypoint for public_trip: first waypoint = first quiz location.
  const publicLocation = useMemo<LngLat>(() => {
    const wp = activeHunt?.waypoints;
    if (Array.isArray(wp) && wp.length > 0) {
      const coords = parseWaypointCoords(wp[0]);
      if (coords && isLngLatInNigeria(coords)) return coords as LngLat;
    }
    return { lng: 8.5, lat: 9.5 };
  }, [activeHunt?.waypoints]);
  const publicLocationLabel = useMemo(() => {
    const wp = activeHunt?.waypoints;
    if (Array.isArray(wp) && wp.length > 0 && wp[0]?.label) return String(wp[0].label);
    return activeHunt?.region_name ?? "Nigeria";
  }, [activeHunt?.waypoints, activeHunt?.region_name]);

  /** Current waypoint the user must be at for the quiz (same logic as restore effect). Source of truth for "at location".
   * keys = number of waypoints passed (earned); we never decrement on quiz fail. So next waypoint index = keys (from DB waypoints). */
  const currentWaypoint = useMemo((): LngLat | null => {
    if (huntPhase === "public_task") return publicLocation;
    if (huntPhase === "hunt" && keys < keysToWin) {
      const next = huntNextLocations[keys];
      return next?.to ?? null;
    }
    return null;
  }, [huntPhase, keys, keysToWin, publicLocation, huntNextLocations]);

  /** Latest coords for refs (restore vs travel race). Position comes from GPS/locator, DB restore after hunt start, travel ticks, or IP fallback. */
  const [playerPos, setPlayerPos] = useState<LngLat | null>(null);
  const playerPosRef = useRef<LngLat | null>(null);
  useEffect(() => {
    playerPosRef.current = playerPos;
  }, [playerPos]);

  /** Persist last known position per hunt so remounting /hunts (or returning from another route) restores the map without tapping the locator again.
   * Pairs with localStorage `loota_locator_used_*` which suppresses auto-geolocate — without this, that flag left playerPos empty after navigation. */
  const lastPosSessionKey = activeHuntId ? `loota_last_pos_${activeHuntId}` : null;
  useLayoutEffect(() => {
    if (!lastPosSessionKey) {
      setPlayerPos(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(lastPosSessionKey);
      if (!raw) {
        setPlayerPos(null);
        return;
      }
      const p = JSON.parse(raw) as { lng?: unknown; lat?: unknown };
      const lng = Number(p.lng);
      const lat = Number(p.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        setPlayerPos(null);
        return;
      }
      setPlayerPos({ lng, lat });
    } catch {
      setPlayerPos(null);
    }
  }, [lastPosSessionKey]);

  useEffect(() => {
    if (!lastPosSessionKey || !playerPos) return;
    try {
      sessionStorage.setItem(lastPosSessionKey, JSON.stringify({ lng: playerPos.lng, lat: playerPos.lat }));
    } catch {
      /* ignore quota / private mode */
    }
  }, [lastPosSessionKey, playerPos]);
  /** Country from a simple one-time location detect (for context only; exact position is from locator). */
  const [userCountry, setUserCountry] = useState<string | null>(null);
  /** True when position is approximate or location failed; show hint to enable location. */
  const [locationIsApproximate, setLocationIsApproximate] = useState(false);
  const [destination, setDestination] = useState<LngLat | null>(null);
  const [routeCoords, setRouteCoords] = useState<Array<[number, number]>>([]);
  const [destinationLabel, setDestinationLabel] = useState<string>("");
  const [pendingDestination, setPendingDestination] = useState<LngLat | null>(null);
  const [pendingDestinationLabel, setPendingDestinationLabel] = useState<string>("");
  const [planeFlow, setPlaneFlow] = useState<
    | null
    | {
        stage: "choose_transfer" | "to_departure" | "boarding" | "flying" | "disembarking";
        finalTo: LngLat;
        finalLabel: string;
        from: LngLat;
        fareCoins: number;
        lookupNonce: number;
        departureAirport?: { place_name: string; center: [number, number] };
        arrivalAirport?: { place_name: string; center: [number, number] };
        loadingDeparture: boolean;
        loadingArrival: boolean;
        error: string | null;
        boardingStartedAt?: number;
        disembarkingEndsAt?: number;
      }
  >(null);
  const setDestinationLabelSafe = useCallback((label: string) => setDestinationLabel(shortenPlaceLabel(label || "")), []);
  const arrivalActionRef = useRef<null | (() => void)>(null);
  const suppressKeyRef = useRef(false);
  /** True after we set playerPos from DB on load; geolocate handler skips first overwrite so refresh keeps saved position. */
  const initialPositionFromDbRef = useRef(false);
  /** Set when entering plane boarding; used by boarding-complete effect to start flight. */
  const boardingFlightStartRef = useRef<{
    playerPos: LngLat;
    arrivalAirportTo: LngLat;
    finalTo: LngLat;
    finalLabel: string;
  } | null>(null);

  // Use avatar from DB (player_profiles); fallback to DiceBear by user id
  const youAvatarUrl =
    profile?.avatar_url && profile.avatar_url.trim()
      ? profile.avatar_url
      : user?.id
        ? `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(user.id)}`
        : "https://api.dicebear.com/8.x/thumbs/svg?seed=guest";

  // Address search (gameplay secrecy: shown only inside destination drawer)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; place_name: string; center: [number, number] }>
  >([]);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const prevDrawerRef = useRef<DrawerId>(null);

  // Clue answer search (kept separate from destination search)
  const [clueQuery, setClueQuery] = useState("");
  const [clueLoading, setClueLoading] = useState(false);
  const [clueError, setClueError] = useState<string | null>(null);
  const [clueResults, setClueResults] = useState<
    Array<{ id: string; place_name: string; center: [number, number] }>
  >([]);
  const clueAbortRef = useRef<AbortController | null>(null);
  const clueDebounceRef = useRef<number | null>(null);

  // Simple travel movement indicator (for now)
  const [isTraveling, setIsTraveling] = useState(false);

  /** Pure geo: within arrival radius of the active hunt waypoint (ignores constraint / hospital).
   * Do not gate on `isTraveling`: the avatar can already be on the checkpoint while the travel flag
   * hasn’t cleared yet; we still need Status/quiz + travel lock based on position vs waypoint. */
  const isNearWaypointGeo = useMemo(() => {
    if (!currentWaypoint || !playerPos) return false;
    return haversineKm(playerPos, currentWaypoint) <= ARRIVAL_RADIUS_KM;
  }, [currentWaypoint, playerPos]);

  /** Helper to check if a stop location matches the current waypoint (quiz destination). Used to avoid conflicts. */
  const stopLocationMatchesWaypoint = useCallback((stopCenter?: [number, number]): boolean => {
    if (!stopCenter || stopCenter.length < 2 || !currentWaypoint) return false;
    const stopLngLat: LngLat = { lng: stopCenter[0], lat: stopCenter[1] };
    const distKm = haversineKm(stopLngLat, currentWaypoint);
    return distKm <= ARRIVAL_RADIUS_KM;
  }, [currentWaypoint]);

  // Store currentWaypoint in a ref so arrival callbacks can access the latest value
  const currentWaypointRef = useRef<LngLat | null>(null);
  useEffect(() => {
    currentWaypointRef.current = currentWaypoint;
  }, [currentWaypoint]);

  /** Returns false if constraint should not be restored (user has moved past it or reached destination). */
  const shouldRestoreConstraintWithPosition = useCallback(
    (
      data: {
        stop?: { place_name: string; center: [number, number] };
        restInPlace?: boolean;
        finalTo: LngLat;
        startedAt?: number;
      },
      positionToCheck: LngLat | null
    ): boolean => {
      if (!positionToCheck) return false;
      if (data.startedAt && Date.now() - data.startedAt > 60 * 60 * 1000) return false;
      if (data.restInPlace && data.stop?.center) {
        const stopLngLat: LngLat = { lng: data.stop.center[0], lat: data.stop.center[1] };
        if (haversineKm(positionToCheck, stopLngLat) > 0.5) return false;
      }
      if (!data.restInPlace && data.stop?.center) {
        const stopLngLat: LngLat = { lng: data.stop.center[0], lat: data.stop.center[1] };
        const distFromStopKm = haversineKm(positionToCheck, stopLngLat);
        const distToFinalKm = haversineKm(positionToCheck, data.finalTo);
        if (distFromStopKm > 0.5) {
          const stopToFinalKm = haversineKm(stopLngLat, data.finalTo);
          if (distToFinalKm < stopToFinalKm - 0.3) return false;
        }
      }
      if (haversineKm(positionToCheck, data.finalTo) <= ARRIVAL_RADIUS_KM) return false;
      return true;
    },
    []
  );

  /** True when Loota's position is within arrival radius of any waypoint from the DB. When true, travel icon is inactive and travel mode in the modal is disabled. */
  const isAtAnyWaypoint = useMemo(() => {
    if (!playerPos || isTraveling) return false;
    const wp = activeHunt?.waypoints;
    if (!Array.isArray(wp) || wp.length === 0) return false;
    for (const w of wp) {
      const coords = parseWaypointCoords(w);
      if (coords && haversineKm(playerPos, coords) <= ARRIVAL_RADIUS_KM) return true;
    }
    return false;
  }, [activeHunt?.waypoints, playerPos, isTraveling]);

  /** 0-based index of the *current quiz waypoint* the player is standing on; otherwise null.
   * We don't return "first nearby waypoint" because close-by waypoints can cause the wrong quiz step
   * to render. Source of truth is: waypoint index derived from DB ("current waypoint") + player GPS. */
  const expectedQuizWaypointIndex = useMemo((): number | null => {
    if (huntPhase === "public_task") return 0;
    if (huntPhase === "hunt" && keys < keysToWin) return keys;
    return null;
  }, [huntPhase, keys, keysToWin]);

  const waypointIndexAtPlayer = useMemo((): number | null => {
    if (expectedQuizWaypointIndex == null) return null;
    if (!playerPos || isTraveling) return null;

    const wp = activeHunt?.waypoints;
    if (!Array.isArray(wp) || wp.length === 0) return null;
    const coords = parseWaypointCoords(wp[expectedQuizWaypointIndex]);
    if (!coords) return null;

    return haversineKm(playerPos, coords) <= ARRIVAL_RADIUS_KM ? expectedQuizWaypointIndex : null;
  }, [expectedQuizWaypointIndex, activeHunt?.waypoints, playerPos, isTraveling]);

  const [progress, setProgress] = useState(0);
  const travelRef = useRef<{
    modeId: TravelModeId;
    coords: Array<[number, number]>;
    cumKm: number[];
    totalKm: number;
    to: LngLat;
    finalDestination?: LngLat; // For bus: final destination after walking from bus stop
    nextRejuvenateAtKm?: number;
    nextRefuelAtKm?: number;
    nextRestAtKm?: number;
    nextBusStopAtKm?: number;
    startedAt: number;
    durationMs: number;
    lastTickAt: number;
  } | null>(null);
  const warnedLowFuelRef = useRef(false);
  const pauseRef = useRef<null | { startedAt: number }>(null);
  const busPauseOpenedRef = useRef(false);
  const [travelActionLoading, setTravelActionLoading] = useState<TravelModeId | null>(null);
  // Synchronous guard against double-clicks/rapid re-triggers before React disables buttons.
  const travelActionLockRef = useRef(false);
  /** Tracks last constraint action sent to hunt_player_actions so we only emit on transition (entered vs exited). */
  const constraintActionEmittedRef = useRef<"entered" | "exited" | null>(null);
  const [travelPause, setTravelPause] = useState<
    | null
    | {
        kind: "bus_stop";
        label: string;
        startedAt: number;
        totalMs: number;
      }
  >(null);

  const [stopFlow, setStopFlow] = useState<
    | null
    | {
        kind: "rejuvenate" | "refuel" | "rest";
        modeId: TravelModeId;
        status: "finding" | "to_stop" | "relaxing" | "ready_to_pay";
        stop?: { place_name: string; center: [number, number] };
        finalTo: LngLat;
        finalLabel: string;
        resumeCoords?: Array<[number, number]>;
        resumeEtaSeconds?: number;
        costCoins: number;
        actionSeconds: number; // in-world seconds (UI), real time is scaled by STOP_SPEEDUP
        startedAt?: number; // real timestamp when action starts
        error?: string | null;
        /** Distance and time to the stop so Loota can see how far (route is on map). */
        distanceMetersToStop?: number;
        durationSecondsToStop?: number;
        /** Route coords to the stop for "Go to this stop" (no auto-start). */
        coordsToStop?: Array<[number, number]>;
        isSecondWarning?: boolean;
        /** True when no relax venue within 2 miles: rest in place 5 min instead of going somewhere. */
        restInPlace?: boolean;
      }
  >(null);

  const [toast, setToast] = useState<null | { title: string; message: string }>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Persist relax/rest decision so reopening the hunt page re-opens the constraint drawer.
  // Store in both database (source of truth, survives reload) and sessionStorage (fast restore).
  // Persist to_stop, relaxing, and ready_to_pay so reload cannot be used to skip payment.
  useEffect(() => {
    if (!activeHuntId || !user?.id || !supabase || !playerPositionsHydrated) return;
    
    const persistStatuses: Array<"finding" | "to_stop" | "relaxing" | "ready_to_pay"> = [
      "finding",
      "to_stop",
      "relaxing",
      "ready_to_pay",
    ];
    const shouldPersist = stopFlow && persistStatuses.includes(stopFlow.status as "finding" | "to_stop" | "relaxing" | "ready_to_pay");
    
    if (shouldPersist) {
      const payload = {
        status: stopFlow.status as "finding" | "to_stop" | "relaxing" | "ready_to_pay",
        kind: stopFlow.kind,
        stop: stopFlow.stop,
        restInPlace: stopFlow.restInPlace,
        costCoins: stopFlow.costCoins,
        actionSeconds: stopFlow.actionSeconds,
        finalTo: stopFlow.finalTo,
        finalLabel: stopFlow.finalLabel,
        modeId: stopFlow.modeId,
        isSecondWarning: stopFlow.isSecondWarning,
        coordsToStop: stopFlow.coordsToStop,
        durationSecondsToStop: stopFlow.durationSecondsToStop,
        distanceMetersToStop: stopFlow.distanceMetersToStop,
        resumeCoords: stopFlow.resumeCoords,
        resumeEtaSeconds: stopFlow.resumeEtaSeconds,
        ...(stopFlow.startedAt != null ? { startedAt: stopFlow.startedAt } : {}),
      };
      
      // Save to database (source of truth - survives reload/clear storage)
      if (playerPos) {
        const playerName = (profile?.username as string) || "Player";
        supabase
          .from("player_positions")
          .upsert(
            {
              hunt_id: activeHuntId,
              player_id: user.id,
              player_name: playerName,
              lng: playerPos.lng,
              lat: playerPos.lat,
              keys,
              travel_mode: travelModeId,
              constraint_state: payload,
              active_client_id: getClientId(),
              last_active_at: new Date().toISOString(),
            },
            { onConflict: "hunt_id,player_id" }
          )
          .then((result: { error: unknown }) => {
            if (result.error) console.warn("[Hunts] save constraint_state error", result.error);
          });
      }

      // Broadcast action feed: emit constraint_entered once per stop (so broadcast can show "who is stopping")
      if (constraintActionEmittedRef.current !== "entered") {
        constraintActionEmittedRef.current = "entered";
        const playerNameForAction = (profile?.username as string) || "Player";
        supabase
          .from("hunt_player_actions")
          .insert({
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerNameForAction,
            action_type: "constraint_entered",
            payload: { kind: stopFlow.kind, status: stopFlow.status },
          })
          .then((r: { error: unknown }) => {
            if (r.error) console.warn("[Hunts] hunt_player_actions constraint_entered error", r.error);
          });
      }

      // Also save to sessionStorage for fast restore (fallback)
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(CONSTRAINT_PENDING_KEY, JSON.stringify({ huntId: activeHuntId, ...payload }));
        } catch {
          // ignore
        }
      }
    } else if (stopFlow === null) {
      // Only clear when user actually left the flow (e.g. paid and continued), not when status is relaxing/ready_to_pay
      if (constraintActionEmittedRef.current === "entered") {
        constraintActionEmittedRef.current = "exited";
        const playerNameForAction = (profile?.username as string) || "Player";
        supabase
          .from("hunt_player_actions")
          .insert({
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerNameForAction,
            action_type: "constraint_exited",
            payload: {},
          })
          .then((r: { error: unknown }) => {
            if (r.error) console.warn("[Hunts] hunt_player_actions constraint_exited error", r.error);
          });
      }
      if (playerPos) {
        const playerName = (profile?.username as string) || "Player";
        supabase
          .from("player_positions")
          .upsert(
            {
              hunt_id: activeHuntId,
              player_id: user.id,
              player_name: playerName,
              lng: playerPos.lng,
              lat: playerPos.lat,
              keys,
              travel_mode: travelModeId,
              constraint_state: null,
              active_client_id: getClientId(),
              last_active_at: new Date().toISOString(),
            },
            { onConflict: "hunt_id,player_id" }
          )
          .then((result: { error: unknown }) => {
            if (result.error) console.warn("[Hunts] clear constraint_state error", result.error);
          });
      }

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(CONSTRAINT_PENDING_KEY);
        } catch {
          // ignore
        }
      }
    }
  }, [stopFlow, activeHuntId, user?.id, supabase, playerPos, keys, travelModeId, profile?.username, playerPositionsHydrated]);

  const atQuizForBroadcast = false;
  const quizStartedEmittedRef = useRef(false);

  // Restore constraint drawer when returning to hunt page (e.g. after navigating away or reloading).
  // Database is source of truth (survives reload/clear storage), sessionStorage is fast fallback.
  useEffect(() => {
    if (!activeHuntId || stopFlow != null || !user?.id || !supabase) return;
    
    let cancelled = false;
    
    // Helper to check if stop location matches current waypoint (conflict check)
    const stopMatchesWaypoint = (stopCenter?: [number, number]): boolean => {
      if (!stopCenter || stopCenter.length < 2 || !currentWaypointRef.current) return false;
      const stopLngLat: LngLat = { lng: stopCenter[0], lat: stopCenter[1] };
      const distKm = haversineKm(stopLngLat, currentWaypointRef.current);
      return distKm <= ARRIVAL_RADIUS_KM;
    };
    
    // First try database (source of truth - survives reload). Fetch lng/lat for validation when GPS not yet ready.
    supabase
      .from("player_positions")
      .select("constraint_state, lng, lat")
      .eq("hunt_id", activeHuntId)
      .eq("player_id", user.id)
      .maybeSingle()
      .then(({ data: row, error }: { data: { constraint_state?: unknown; lng?: number; lat?: number } | null; error: unknown }) => {
        if (cancelled) return;
        
        if (!error && row?.constraint_state && typeof row.constraint_state === "object") {
          try {
            const data = row.constraint_state as {
              status: "finding" | "to_stop" | "relaxing" | "ready_to_pay";
              kind: "rejuvenate" | "refuel" | "rest";
              stop?: { place_name: string; center: [number, number] };
              restInPlace?: boolean;
              costCoins: number;
              actionSeconds: number;
              finalTo: LngLat;
              finalLabel: string;
              modeId: TravelModeId;
              isSecondWarning?: boolean;
              coordsToStop?: Array<[number, number]>;
              durationSecondsToStop?: number;
              distanceMetersToStop?: number;
              resumeCoords?: Array<[number, number]>;
              resumeEtaSeconds?: number;
              startedAt?: number;
            };
            if (
              data.status === "finding" ||
              data.status === "to_stop" ||
              data.status === "relaxing" ||
              data.status === "ready_to_pay"
            ) {
              // Enforced flow: never auto-clear on reload/navigation.
              // Only explicit user actions should end this state.
              setStopFlow(data);
              // Don't show constraint drawer if stop location matches quiz destination - let quiz modal handle it
              if (!stopMatchesWaypoint(data.stop?.center)) {
                setDrawer("constraint");
              }
              return;
            }
          } catch {
            // invalid data, try sessionStorage fallback
          }
        }
        
        // Fallback to sessionStorage (faster, but can be cleared)
        if (typeof window === "undefined") return;
        try {
          const raw = window.sessionStorage.getItem(CONSTRAINT_PENDING_KEY);
          if (!raw) return;
          const data = JSON.parse(raw) as {
            huntId: string;
            kind: "rejuvenate" | "refuel" | "rest";
            stop?: { place_name: string; center: [number, number] };
            restInPlace?: boolean;
            costCoins: number;
            actionSeconds: number;
            finalTo: LngLat;
            finalLabel: string;
            modeId: TravelModeId;
            isSecondWarning?: boolean;
            coordsToStop?: Array<[number, number]>;
            durationSecondsToStop?: number;
            distanceMetersToStop?: number;
            resumeCoords?: Array<[number, number]>;
            resumeEtaSeconds?: number;
            startedAt?: number;
          };
          if (data.huntId !== activeHuntId) return;
          
          setStopFlow({
            ...data,
            status:
              (data as { status?: "finding" | "to_stop" | "relaxing" | "ready_to_pay" }).status ?? "to_stop",
          });
          // Don't show constraint drawer if stop location matches quiz destination - let quiz modal handle it
          if (!stopMatchesWaypoint(data.stop?.center)) {
            setDrawer("constraint");
          }
        } catch {
          // ignore invalid or missing data
        }
      });
    
    // Do not depend on `stopFlow`: when the user dismisses the constraint (e.g. "Continue anyway"), we clear
    // stopFlow before the DB upsert finishes; re-running this effect immediately would re-hydrate stale
    // constraint_state from the fetch and reopen the modal. Restore runs on hunt/user changes and mount instead.
    return () => {
      cancelled = true;
    };
  }, [activeHuntId, user?.id, supabase, playerPos, profile?.username, shouldRestoreConstraintWithPosition]);

  // Keep enforced constraint pending until action is taken; never auto-clear by position checks.
  useEffect(() => {
    return;
  }, [stopFlow]);

  // When user is at the current waypoint (waypoint vs current location match), sync state and show status/quiz.
  // This handles: just arrived, or returned/reloaded while already at the location.
  const hasRestoredArrivedDrawerRef = useRef(false);
  /** When true, the next run of the "at waypoint" effect should skip (user just clicked Continue; don't re-open Status). */
  const skipNextAtWaypointEffectRef = useRef(false);
  /** Guard so location-quiz fail reroute runs only once even if effect/timeout fires twice. */
  const rerouteInProgressRef = useRef(false);
  const failLocationQuizRef = useRef<(reason: "wrong" | "timeout") => void>(() => {});
  // Page sets failLocationQuizRef.current = failLocationQuiz in an effect so hook can call it via failLocationQuizStable
  const failLocationQuizStable = useCallback((reason: "wrong" | "timeout"): Promise<void> => {
    failLocationQuizRef.current(reason);
    return Promise.resolve();
  }, []);
  // Reset the restore ref when user leaves the quiz context (e.g. starts traveling or no longer at waypoint)
  useEffect(() => {
    if (!arrivedForChallenge || isTraveling) hasRestoredArrivedDrawerRef.current = false;
  }, [arrivedForChallenge, isTraveling]);

  // Hysteresis: only clear arrived when clearly outside radius (stops boundary flicker / avatar glitter at quiz).
  const isClearlyAwayFromWaypoint = useMemo(() => {
    if (!currentWaypoint || !playerPos || isTraveling) return false;
    const distKm = haversineKm(playerPos, currentWaypoint);
    return distKm > ARRIVAL_RADIUS_KM * 1.5;
  }, [currentWaypoint, playerPos, isTraveling]);
  useEffect(() => {
    if (isClearlyAwayFromWaypoint) setArrivedForChallenge(false);
  }, [isClearlyAwayFromWaypoint]);

  const [vehicleState, setVehicleState] = useState<
    Record<
      VehicleId,
      {
        healthPct: number; // 0..100
        warnedLow: boolean; // warned at <= 10%
        status: "ok" | "servicing" | "broken_needs_tow" | "repairing";
        untilMs?: number; // for servicing/repairing
      }
    >
  >(() => ({
    bicycle: { healthPct: 100, warnedLow: false, status: "ok" },
    motorbike: { healthPct: 100, warnedLow: false, status: "ok" },
    car: { healthPct: 100, warnedLow: false, status: "ok" },
  }));
  const vehicleStateRef = useRef(vehicleState);
  useEffect(() => {
    vehicleStateRef.current = vehicleState;
  }, [vehicleState]);

  const [breakdownFlow, setBreakdownFlow] = useState<null | { modeId: VehicleId }>(null);

  const [consequenceFlow, setConsequenceFlow] = useState<ConsequenceFlow | null>(null);
  /** After "Continue anyway", trigger consequence. For faint: stage 'second_warning' = 0.75km then show prompt again; 'faint' = 0.25km then faint. */
  const consequenceTriggerRef = useRef<{
    triggerAfterKm: number;
    kind: ConsequenceFlow["kind"];
    modeId: TravelModeId;
    stage?: "second_warning" | "faint";
  } | null>(null);
  /** For out_of_fuel: after reaching gas station, walk back to this position (vehicle). */
  const consequenceReturnToRef = useRef<LngLat | null>(null);
  /** True when current travel destination is hospital (faint consequence); on arrival start hospital stay. */
  const travellingToHospitalRef = useRef(false);
  /** True while travelling to hospital (for unified faint modal "En route" stage). */
  const [isTravellingToHospital, setIsTravellingToHospital] = useState(false);
  /** True when in the 0.75km or 0.25km window after ignoring rejuvenate (walk icon shows red). */
  const [faintDangerActive, setFaintDangerActive] = useState(false);

  const [hospitalStay, setHospitalStay] = useState<{
    startedAt: number;
    durationMs: number;
    costCoins: number;
    at?: LngLat;
    /** True when bill includes bicycle recovery + repair (fainted on bike). */
    bikeRecoveryIncluded?: boolean;
  } | null>(null);

  /** When set, user has fainted: avatar shows red plus, ambulance moves along route to user over 2 min, then we route to hospital. */
  const [faintPhase, setFaintPhase] = useState<{
    at: LngLat;
    startedAt: number;
    ambulanceArrivalMs: number;
    /** Route coords so ambulance comes along the road (from back or front). */
    routeCoords: Array<[number, number]>;
    /** Destination (forward direction) so we can pick a hospital ahead. */
    forwardTo: LngLat;
  } | null>(null);

  /**
   * True only when the player may see the location quiz: geo match to DB waypoint AND
   * not in constraint / hospital / pending enforcement, AND not standing on a dedicated
   * constraint stop (avoids one-frame races and overlap with hunt checkpoints).
   */
  const isAtCurrentWaypoint = useMemo(() => {
    if (!isNearWaypointGeo) return false;

    if (faintPhase != null || hospitalStay != null || isTravellingToHospital) {
      return false;
    }
    if (activeHuntId && readPendingHospitalHuntId() === activeHuntId) {
      return false;
    }

    if (
      stopFlow?.status === "finding" ||
      stopFlow?.status === "to_stop" ||
      stopFlow?.status === "relaxing" ||
      stopFlow?.status === "ready_to_pay"
    ) {
      return false;
    }

    const storage = readConstraintPendingForQuizBlock(activeHuntId);
    if (storage.pending) {
      return false;
    }

    const stopFromFlow = stopFlow?.stop?.center;
    const sc: [number, number] | null = stopFromFlow
      ? [stopFromFlow[0], stopFromFlow[1]]
      : storage.stopCenter;
    if (playerPos && sc && !stopFlow?.restInPlace && !storage.restInPlace) {
      const atDedicatedStop =
        haversineKm(playerPos, { lng: sc[0], lat: sc[1] }) <= ARRIVAL_RADIUS_KM * 2.5;
      if (atDedicatedStop && !stopLocationMatchesWaypoint(sc)) {
        return false;
      }
    }

    return true;
  }, [
    isNearWaypointGeo,
    activeHuntId,
    stopFlow?.status,
    stopFlow?.stop?.center,
    stopFlow?.restInPlace,
    playerPos,
    faintPhase,
    hospitalStay,
    isTravellingToHospital,
    stopLocationMatchesWaypoint,
  ]);

  // When user is at the current waypoint (waypoint vs current location match), sync state and show status/quiz.
  useEffect(() => {
    if (!huntHasStarted || !activeHuntId) return;
    if (faintPhase != null || hospitalStay != null || isTravellingToHospital) return;
    if (activeHuntId && readPendingHospitalHuntId() === activeHuntId) return;

    if (
      stopFlow?.status === "finding" ||
      stopFlow?.status === "to_stop" ||
      stopFlow?.status === "relaxing" ||
      stopFlow?.status === "ready_to_pay"
    ) {
      return;
    }
    if (readConstraintPendingForQuizBlock(activeHuntId).pending) {
      return;
    }

    if (skipNextAtWaypointEffectRef.current) {
      if (!isAtCurrentWaypoint) skipNextAtWaypointEffectRef.current = false;
      return;
    }
    if (!isAtCurrentWaypoint) return;

    setArrivedForChallenge(true);
    setPendingDestination(null);
    setPendingDestinationLabel("");
    if (huntPhase === "public_task") {
      setClueUnlocked(false);
      setRps(null);
    } else {
      setClueUnlocked(true);
      setArrivalChallengeIntro(false);
      setRps(null);
    }

    if (!hasRestoredArrivedDrawerRef.current) {
      hasRestoredArrivedDrawerRef.current = true;
      setDrawer("status");
    }
  }, [
    huntHasStarted,
    activeHuntId,
    isAtCurrentWaypoint,
    huntPhase,
    stopFlow?.status,
    faintPhase,
    hospitalStay,
    isTravellingToHospital,
  ]);

  // Notify nav icons when there is something to check (travel: destination ready; garage: maintenance; status: task/clue)
  useEffect(() => {
    setNavNotifications((prev) => {
      const hasDestination =
        Boolean(pendingDestination) ||
        Boolean(destination) ||
        (huntPhase === "public_trip" && Boolean(publicLocation));
      const hasTaskToDo = Boolean(publicTaskQuestion) || Boolean(unlockTaskQuestion);
      const travel =
        huntHasStarted && !isTraveling && hasDestination && !hasTaskToDo;

      const garage = (VEHICLE_IDS as VehicleId[]).some((id) => {
        const v = vehicleState[id];
        return v && (v.healthPct <= MAINT_WARN_PCT || v.status === "broken_needs_tow");
      });

      const status =
        isAtCurrentWaypoint ||
        arrivedForChallenge ||
        Boolean(publicTaskQuestion) ||
        Boolean(unlockTaskQuestion);

      return { ...prev, travel, garage, status };
    });
  }, [
    huntHasStarted,
    isTraveling,
    pendingDestination,
    destination,
    huntPhase,
    publicLocation,
    vehicleState,
    isAtCurrentWaypoint,
    arrivedForChallenge,
    publicTaskQuestion,
    unlockTaskQuestion,
  ]);

  const sosActive = useMemo(() => {
    // SOS when you're blocked by coins during an enforced action (stop payment or tow).
    const stopBlocked =
      Boolean(stopFlow) &&
      stopFlow?.status === "ready_to_pay" &&
      credits < (stopFlow?.costCoins ?? 0);
    const towBlocked =
      Boolean(breakdownFlow) &&
      Boolean(breakdownFlow?.modeId) &&
      credits < (TOW_COST[breakdownFlow!.modeId] ?? 0);
    return stopBlocked || towBlocked;
  }, [breakdownFlow, credits, stopFlow]);

  const [prep, setPrep] = useState<
    | null
    | {
        modeId: TravelModeId;
      stage: "single" | "bus_walk" | "bus_wait";
        label: string;
        startedAt: number;
        totalMs: number;
      }
  >(null);
  const [clock, setClock] = useState(0);
  // Global clock tick for timers (maintenance/repair/etc)
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 600);
    return () => window.clearInterval(t);
  }, []);

  // Task timer effects (public/unlock timeout) live in page so failPublicTask/failUnlockTask are in scope.
  const prepPlanRef = useRef<
    | null
    | {
        modeId: TravelModeId;
        to: LngLat;
        finalDestination?: LngLat; // For bus: final destination after walking from bus stop
        label: string;
        coords: Array<[number, number]>;
        etaSeconds: number;
        walkDuringPrep: boolean;
      }
  >(null);
  /** Last position during prep walk (avoids effect re-running every 250ms and interval churn / jitter). */
  const prepWalkLastPosRef = useRef<LngLat | null>(null);
  const prepWalkRef = useRef<
    | null
    | {
        coords: Array<[number, number]>;
        cumKm: number[];
        totalKm: number;
        startedAt: number;
        durationMs: number;
      }
  >(null);
  const pickupMarkerRef = useRef<any>(null);
  const pickupMarkerModeRef = useRef<TravelModeId | null>(null);
  const ambulanceMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const destinationPinColorRef = useRef<"blue" | "green" | "red" | "yellow">("yellow");
  const destinationMarkerLastPosRef = useRef<[number, number] | null>(null);
  const youMarkerIsAmbulanceRef = useRef(false);
  const huntDestinationAfterHospitalRef = useRef<{ to: LngLat; label: string; modeId: TravelModeId } | null>(null);
  /** When user fainted on a bicycle (owned or rental): bike left at scene; we add recovery+repair to hospital bill and on discharge owned bike goes to repairing, resume on foot. */
  const bicycleFaintRef = useRef<{ wasRental: boolean } | null>(null);

  /** Realtime channel for cross-tab position sync (unsubscribe on cleanup). */
  const positionRealtimeRef = useRef<ReturnType<ReturnType<typeof supabase.channel>["subscribe"]> | null>(null);
  /** So Realtime callback can see current isTraveling without stale closure. */
  const isTravelingRef = useRef(false);
  /** Once user has started travelling this hunt, never let geolocate overwrite position (stops/quiz stay in place). */
  const travellingHasStartedThisHuntRef = useRef(false);
  /** Latest position for travel sync interval (avoids stale closure). */
  const travelSyncPosRef = useRef<LngLat | null>(null);
  /** True when we were traveling (so broadcast can clear travel_* on end). */
  const wasTravelingForBroadcastRef = useRef(false);
  /** Store travel payload so 1500ms sync re-sends same route (keeps broadcast/mobile on exact path). */
  const travelBroadcastPayloadRef = useRef<{
    startedAt: string;
    routeCoords: Array<[number, number]>;
    durationMs: number;
  } | null>(null);
  /** Rich game-state blob for broadcast narrator dashboard (updated by animation tick, included in DB upserts). */
  const narratorStateRef = useRef<Record<string, unknown> | null>(null);

  /** After arrival we upsert and ignore realtime for a short window so stale DB updates don't move the avatar back. */
  const lastArrivalAtRef = useRef<number>(0);
  const ARRIVAL_REALTIME_IGNORE_MS = 3000;
  /** When we started traveling (timestamp); ignore realtime position for a short window so our own upsert's event doesn't overwrite. */
  const travelStartedAtRef = useRef<number>(0);
  const TRAVEL_START_REALTIME_IGNORE_MS = 2500;

  useEffect(() => {
    isTravelingRef.current = isTraveling;
    if (isTraveling) lastArrivalAtRef.current = 0;
    if (!isTraveling) travelStartedAtRef.current = 0;
  }, [isTraveling]);
  useEffect(() => {
    if (isTraveling) wasTravelingForBroadcastRef.current = true;
  }, [isTraveling]);
  useEffect(() => {
    if (activeHuntId && isTraveling) travellingHasStartedThisHuntRef.current = true;
  }, [activeHuntId, isTraveling]);
  useEffect(() => {
    if (!activeHuntId) travellingHasStartedThisHuntRef.current = false;
  }, [activeHuntId]);
  useEffect(() => {
    travelSyncPosRef.current = playerPos;
  }, [playerPos]);

  /** When user reloaded/navigated away during travel: we have route+mode to resume. Cleared when they tap Continue. */
  const [resumableTravel, setResumableTravel] = useState<{
    routeCoords: Array<[number, number]>;
    durationMs: number;
    modeId: TravelModeId;
  } | null>(null);

  useEffect(() => {
    if (isTraveling) setResumableTravel(null);
  }, [isTraveling]);

  // On load/refresh after hunt has started: restore position (and keys/travel_mode) from DB for this hunt only.
  // We only fetch for current activeHuntId â€” never another hunt or a previous hunt's quiz location.
  // Before start we do not restore; position comes from geolocate so the user sees current location. After start, refresh puts them back at last saved position (saved continuously as they move, ~2s debounce).
  useEffect(() => {
    if (!activeHuntId || !user?.id || !supabase) {
      setPlayerPositionsHydrated(true);
      return;
    }
    let cancelled = false;
    setPlayerPositionsHydrated(false);
    supabase
      .from("player_positions")
      .select("lng, lat, keys, travel_mode, constraint_state, travel_started_at, travel_route_coords, travel_duration_ms")
      .eq("hunt_id", activeHuntId)
      .eq("player_id", user.id)
      .maybeSingle()
      .then(({ data: row, error }: { data: { lng: number; lat: number; keys?: number; travel_mode?: string; constraint_state?: unknown; travel_started_at?: string | null; travel_route_coords?: unknown; travel_duration_ms?: number | null } | null; error: unknown }) => {
        if (cancelled || error || !row) return;
        const lng = Number(row.lng);
        const lat = Number(row.lat);
        const posOk = Number.isFinite(lng) && Number.isFinite(lat);
        // Only skip DB lng/lat when travel animation already owns a position (slow fetch after Go).
        // If isTraveling but playerPos is still null (e.g. interval not run yet), we MUST apply DB or map stays on Nigeria default.
        if (!(isTravelingRef.current && playerPosRef.current != null) && posOk) {
          initialPositionFromDbRef.current = true;
          setPlayerPos({ lng, lat });
        }
        if (typeof row.keys === "number" && row.keys >= 0) setKeys(row.keys);
        // User has passed at least one waypoint â†’ they are in "hunt" phase, not "public_trip", so current/next waypoint uses keys.
        if (typeof row.keys === "number" && row.keys >= 1) setHuntPhase("hunt");
        if (row.travel_mode && ["walk", "bicycle", "motorbike", "car", "bus", "plane"].includes(row.travel_mode)) {
          setTravelModeId(row.travel_mode as TravelModeId);
        }
        // If we have travel data, user can tap Continue to resume the journey
        const coords = row.travel_route_coords;
        const durationMs = row.travel_duration_ms;
        const modeId = row.travel_mode;
        if (
          Array.isArray(coords) &&
          coords.length >= 2 &&
          typeof durationMs === "number" &&
          Number.isFinite(durationMs) &&
          durationMs > 0 &&
          modeId &&
          ["walk", "bicycle", "motorbike", "car", "bus", "plane"].includes(modeId)
        ) {
          const validCoords: Array<[number, number]> = [];
          for (let i = 0; i < coords.length; i++) {
            const pt = coords[i];
            if (Array.isArray(pt) && pt.length >= 2) {
              const a = Number(pt[0]);
              const b = Number(pt[1]);
              if (Number.isFinite(a) && Number.isFinite(b)) validCoords.push([a, b]);
            }
          }
          if (validCoords.length >= 2) {
            setResumableTravel({
              routeCoords: validCoords,
              durationMs: Math.round(durationMs),
              modeId: modeId as TravelModeId,
            });
          }
        } else {
          setResumableTravel(null);
        }
        // Constraint state is restored by the dedicated constraint restore effect below
      })
      .finally(() => {
        if (!cancelled) setPlayerPositionsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeHuntId, user?.id]);
  return {
    tokenPresent, youName, getTaskSeed, user, profile, refreshProfile, updateCredits, credits, setCredits,
    huntersHunting, setHuntersHunting, otherDeviceRole, setOtherDeviceRole, anotherDeviceActive, lightPreset, setLightPreset,
    mapContainerRef, mapRef, mapboxRef, youMarkerRef, lastCameraEaseAtRef, prevMovePosRef, lastMoveBearingRef,
    activeHuntIdRef, huntHasStartedRef, setLocatorUsedThisHuntRef, mapReady, setMapReady, locatorUsedThisHunt, setLocatorUsedThisHunt,
    drawer, setDrawer, resumeDrawerRef, navNotifications, setNavNotifications, shopError, setShopError, payError, setPayError,
    paystackLoading, setPaystackLoading, huntLeaderboard, setHuntLeaderboard, leaderboardLoading, setLeaderboardLoading,
    initialCreditsRef, activeHunt, setActiveHunt, activeHuntId, setActiveHuntId, isRegisteredForHunt, secondsUntilStart,
    huntFetchDone, huntHasStarted, deductCredits, keys, setKeys, keysToWin, huntPhase, setHuntPhase, travelModeId, setTravelModeId,
    playerPositionsHydrated,
    travelMode, travelPickModeId, setTravelPickModeId, startLocation, publicLocation, publicLocationLabel, currentWaypoint,
    playerPos, setPlayerPos, userCountry, setUserCountry, locationIsApproximate, setLocationIsApproximate, destination, setDestination,
    routeCoords, setRouteCoords, destinationLabel, setDestinationLabel, pendingDestination, setPendingDestination,
    pendingDestinationLabel, setPendingDestinationLabel, planeFlow, setPlaneFlow, huntNextLocations, demoUnlockTasks, publicTaskFromHunt,
    firstNextLocation, youAvatarUrl, isTraveling, setIsTraveling, isAtCurrentWaypoint, stopLocationMatchesWaypoint, currentWaypointRef,
    shouldRestoreConstraintWithPosition, isAtAnyWaypoint, waypointIndexAtPlayer, progress, setProgress, travelRef, travelActionLoading,
    setTravelActionLoading,     travelPause, setTravelPause, stopFlow, setStopFlow, toast, setToast,
    resumableTravel, setResumableTravel,
    // Task/public/unlock state and refs
    publicTaskStepNumber, publicTaskAnswer, setPublicTaskAnswer, publicTaskError, setPublicTaskError, publicTaskFeedback, setPublicTaskFeedback,
    publicTaskStage, setPublicTaskStage, publicTaskAttempt, setPublicTaskAttempt, publicTaskQuestion, setPublicTaskQuestion,
    publicTaskDeadlineMs, setPublicTaskDeadlineMs, publicTaskTimedOutRef, unlockAnswer, setUnlockAnswer, unlockError, setUnlockError,
    unlockTaskFeedback, setUnlockTaskFeedback, unlockTaskStage, setUnlockTaskStage, unlockTaskAttempt, setUnlockTaskAttempt,
    unlockTaskQuestion, setUnlockTaskQuestion, unlockTaskDeadlineMs, setUnlockTaskDeadlineMs, unlockTaskTimedOutRef,
    unlockCheckpoint, setUnlockCheckpoint, relocationCountdown, setRelocationCountdown, locationQuizFailMessage, setLocationQuizFailMessage,
    unlockRetry, setUnlockRetry, publicInitRef, arrivedForChallenge, setArrivedForChallenge, arrivalChallengeIntro, setArrivalChallengeIntro,
    clueUnlocked, setClueUnlocked, rps, setRps, rpsAwardedRef, keysRef, keysPrevRef, huntPhaseRef, clueUnlockedRef, unlockRetryRef,
    setDestinationLabelSafe, arrivalActionRef, suppressKeyRef, initialPositionFromDbRef, boardingFlightStartRef,
    searchQuery, setSearchQuery, searchLoading, setSearchLoading, searchError, setSearchError, searchResults, setSearchResults,
    clueQuery, setClueQuery, clueLoading, setClueLoading, clueError, setClueError, clueResults, setClueResults,
    searchAbortRef, searchDebounceRef, clueAbortRef, clueDebounceRef, prevDrawerRef,
    warnedLowFuelRef, pauseRef, busPauseOpenedRef, travelActionLockRef, constraintActionEmittedRef, atQuizForBroadcast, quizStartedEmittedRef,
    hasRestoredArrivedDrawerRef, skipNextAtWaypointEffectRef, rerouteInProgressRef, failLocationQuizRef, failLocationQuizStable, isClearlyAwayFromWaypoint,
    vehicleState, setVehicleState, vehicleStateRef, breakdownFlow, setBreakdownFlow, consequenceFlow, setConsequenceFlow,
    consequenceTriggerRef, consequenceReturnToRef, travellingToHospitalRef, isTravellingToHospital, setIsTravellingToHospital,
    faintDangerActive, setFaintDangerActive, hospitalStay, setHospitalStay, faintPhase, setFaintPhase, sosActive,
    prep, setPrep, clock, setClock, prepPlanRef, prepWalkLastPosRef, prepWalkRef, pickupMarkerRef, pickupMarkerModeRef,
    ambulanceMarkerRef, destinationMarkerRef, destinationPinColorRef, destinationMarkerLastPosRef,
    youMarkerIsAmbulanceRef, huntDestinationAfterHospitalRef, bicycleFaintRef, positionRealtimeRef, isTravelingRef,
    travellingHasStartedThisHuntRef, travelSyncPosRef, wasTravelingForBroadcastRef, travelBroadcastPayloadRef, narratorStateRef, lastArrivalAtRef,
    ARRIVAL_REALTIME_IGNORE_MS, travelStartedAtRef, TRAVEL_START_REALTIME_IGNORE_MS,
  } as any;
};

