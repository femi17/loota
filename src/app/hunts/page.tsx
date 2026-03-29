"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { getClientId } from "@/lib/client-id";
import {
  getHuntsMapCameraDbFields,
  refreshHuntsMapCameraSnapshot,
} from "@/lib/hunts-map-camera-sync";
import { addMapboxTrafficLayer } from "@/lib/mapbox-traffic-layer";
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
} from "./types";
import {
  DEMO_TRAVEL_SPEED_KMH,
  ARRIVAL_RADIUS_KM,
  SIM_SPEEDUP,
  WALK_ANIMATION_SPEEDUP,
  MIN_WALK_ANIMATION_MS,
  MAX_WALK_ANIMATION_MS,
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
} from "./constants";
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
  positionAlongRoute,
} from "./utils";
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
} from "./mapMarkerFactories";
import { useHuntData } from "./useHuntData";
import { useHuntsCore } from "./hooks/useHuntsCore";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const PAYSTACK_PUBLIC_KEY_FREE = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
const PAYSTACK_PUBLIC_KEY_PAID = process.env.PAID_PAYSTACK_PUBLIC_KEY ?? "";
const CONSTRAINT_PENDING_KEY = "loota_constraint_to_stop";
const HOSPITAL_PENDING_KEY = "loota_hospital_pending";

export default function HuntsPage() {
  const core: ReturnType<typeof useHuntsCore> = useHuntsCore();
  const {
    tokenPresent, youName, getTaskSeed, user, profile, refreshProfile, updateCredits, credits, setCredits,
    huntersHunting, setHuntersHunting, otherDeviceRole, setOtherDeviceRole, anotherDeviceActive, lightPreset, setLightPreset,
    mapContainerRef, mapRef, mapboxRef, youMarkerRef, lastCameraEaseAtRef, prevMovePosRef, lastMoveBearingRef,
    activeHuntIdRef, huntHasStartedRef, mapReady, setMapReady,
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
    setTravelActionLoading, travelPause, setTravelPause, stopFlow, setStopFlow, toast, setToast,
    resumableTravel, setResumableTravel,
    publicTaskStepNumber, publicTaskAnswer, setPublicTaskAnswer, publicTaskError, setPublicTaskError, publicTaskFeedback, setPublicTaskFeedback,
    publicTaskStage, setPublicTaskStage, publicTaskAttempt, setPublicTaskAttempt, publicTaskQuestion, setPublicTaskQuestion,
    publicTaskDeadlineMs, setPublicTaskDeadlineMs, publicTaskTimedOutRef, unlockAnswer, setUnlockAnswer, unlockError, setUnlockError,
    unlockTaskFeedback, setUnlockTaskFeedback, unlockTaskStage, setUnlockTaskStage, unlockTaskAttempt, setUnlockTaskAttempt,
    unlockTaskQuestion, setUnlockTaskQuestion, unlockTaskDeadlineMs, setUnlockTaskDeadlineMs, unlockTaskTimedOutRef,
    unlockCheckpoint, setUnlockCheckpoint, relocationCountdown, setRelocationCountdown, locationQuizFailMessage, setLocationQuizFailMessage,
    unlockRetry, setUnlockRetry, publicInitRef, arrivedForChallenge, setArrivedForChallenge, arrivalChallengeIntro, setArrivalChallengeIntro,
    clueUnlocked, setClueUnlocked, rps, setRps, rpsAwardedRef, keysRef, keysPrevRef, huntPhaseRef, clueUnlockedRef, unlockRetryRef,
    setDestinationLabelSafe, arrivalActionRef, suppressKeyRef, boardingFlightStartRef,
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
  } = core;

  const [gatewayActionLoading, setGatewayActionLoading] = useState(false);
  const winnerRecordedRef = useRef<string | null>(null);
  const [completionResult, setCompletionResult] = useState<{
    placement: number | null;
    isWinner: boolean | null;
    winnersCount: number | null;
  } | null>(null);
  const [completionConfettiVisible, setCompletionConfettiVisible] = useState(false);
  /** After remount, map starts at Nigeria zoom 5 — jump camera once when we first get a real position (avoids stuck country view). */
  const initialHuntsCameraSnapRef = useRef(false);
  /** Travel camera throttling (same idea as broadcast): RAF + route time, not setPlayerPos (250ms). */
  const huntsTravelCameraLastMoveAtRef = useRef(0);
  /** While a route is shown or during travel, user may pan/zoom; pause auto-follow so the camera does not fight them. */
  const huntsRouteExplorePauseAtRef = useRef(0);

  // Persist hospital/faint enforcement so reload/navigation cannot bypass required action/payment.
  useEffect(() => {
    if (typeof window === "undefined" || !activeHuntId) return;
    try {
      if (hospitalStay) {
        window.sessionStorage.setItem(
          HOSPITAL_PENDING_KEY,
          JSON.stringify({
            huntId: activeHuntId,
            status: "stay",
            hospitalStay: {
              startedAt: hospitalStay.startedAt,
              durationMs: hospitalStay.durationMs,
              costCoins: hospitalStay.costCoins,
              bikeRecoveryIncluded: Boolean(hospitalStay.bikeRecoveryIncluded),
            },
          }),
        );
        return;
      }
      if (faintPhase || isTravellingToHospital) {
        window.sessionStorage.setItem(
          HOSPITAL_PENDING_KEY,
          JSON.stringify({
            huntId: activeHuntId,
            status: faintPhase ? "faint" : "enroute",
            costCoins: HOSPITAL_BILL,
          }),
        );
        return;
      }
      window.sessionStorage.removeItem(HOSPITAL_PENDING_KEY);
    } catch {
      // ignore storage issues
    }
  }, [activeHuntId, faintPhase, hospitalStay, isTravellingToHospital]);

  // Restore hospital/faint enforcement on re-entry.
  useEffect(() => {
    if (typeof window === "undefined" || !activeHuntId) return;
    if (hospitalStay || faintPhase || isTravellingToHospital) return;
    try {
      const raw = window.sessionStorage.getItem(HOSPITAL_PENDING_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        huntId: string;
        status?: "faint" | "enroute" | "stay";
        costCoins?: number;
        hospitalStay?: {
          startedAt?: number;
          durationMs?: number;
          costCoins?: number;
          bikeRecoveryIncluded?: boolean;
        };
      };
      if (data.huntId !== activeHuntId) return;
      if (
        data.status === "stay" &&
        data.hospitalStay &&
        Number.isFinite(data.hospitalStay.startedAt) &&
        Number.isFinite(data.hospitalStay.durationMs) &&
        Number.isFinite(data.hospitalStay.costCoins)
      ) {
        setHospitalStay({
          startedAt: Number(data.hospitalStay.startedAt),
          durationMs: Math.max(1000, Number(data.hospitalStay.durationMs)),
          costCoins: Math.max(0, Number(data.hospitalStay.costCoins)),
          bikeRecoveryIncluded: Boolean(data.hospitalStay.bikeRecoveryIncluded),
        });
      } else {
        // If user left during faint/enroute, keep hospital enforcement active.
        // Crucially: when status is "enroute", we MUST restore the enroute guard so travel completion
        // cannot be reinterpreted as arriving at a quiz waypoint.
        if (data.status === "enroute") {
          travellingToHospitalRef.current = true;
          setIsTravellingToHospital(true);
        } else {
          // For "faint" (ambulance on the way) we resume as a hospital stay so the flow can't be bypassed.
          const stayRealMs = (HOSPITAL_STAY_MINUTES * 60 * 1000) / STOP_SPEEDUP;
          setHospitalStay({
            startedAt: Date.now(),
            durationMs: stayRealMs,
            costCoins: Math.max(0, Number(data.costCoins ?? HOSPITAL_BILL)),
          });
        }
      }
      setDrawer("hospital");
    } catch {
      // ignore invalid storage payload
    }
  }, [activeHuntId, faintPhase, hospitalStay, isTravellingToHospital, setDrawer, setHospitalStay, setIsTravellingToHospital, travellingToHospitalRef]);

  // Keep the hospital enroute ref in sync with state so reload/restore can't lose the guard.
  useEffect(() => {
    travellingToHospitalRef.current = Boolean(isTravellingToHospital);
  }, [isTravellingToHospital, travellingToHospitalRef]);

  function getTravelBroadcastPayloadForDb() {
    const payload = travelBroadcastPayloadRef.current;
    if (!payload) return null;
    const startedAtMs = travelRef.current?.startedAt;
    return {
      startedAt:
        typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
          ? new Date(startedAtMs).toISOString()
          : payload.startedAt,
      routeCoords: payload.routeCoords,
      durationMs: payload.durationMs,
    };
  }

  function serializeRouteCoords(coords: Array<[number, number]>): Array<[number, number]> {
    return coords.map(
      ([lng, lat]) =>
        [Number(Number(lng).toFixed(6)), Number(Number(lat).toFixed(6))] as [number, number]
    );
  }

  function emitHuntPlayerAction(actionType: string, payload?: Record<string, unknown>) {
    if (!activeHuntId || !user?.id || !supabase) return;
    const playerName = (profile?.username as string) || "Player";
    supabase
      .from("hunt_player_actions")
      .insert({
        hunt_id: activeHuntId,
        player_id: user.id,
        player_name: playerName,
        action_type: actionType,
        payload: payload ?? {},
      })
      .then((r: { error: unknown }) => {
        if (r.error) console.warn(`[Hunts] hunt_player_actions ${actionType} error`, r.error);
      });
  }

  // Task timer: auto-fail when time runs out (public task) — kept here so failPublicTask is in scope
  useEffect(() => {
    if (huntPhase !== "public_task") return;
    if (publicTaskStage !== "active") return;
    if (!publicTaskDeadlineMs) return;
    const left = Math.max(0, Math.ceil((publicTaskDeadlineMs - clock) / 1000));
    if (left > 0) return;
    if (publicTaskTimedOutRef.current) return;
    publicTaskTimedOutRef.current = true;
    void (async () => {
      await failPublicTask("timeout");
      publicTaskTimedOutRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, huntPhase, publicTaskDeadlineMs, publicTaskStage]);

  // Task timer: auto-fail when time runs out (unlock task)
  useEffect(() => {
    if (!clueUnlocked) return;
    if (unlockTaskStage !== "active") return;
    if (!unlockTaskDeadlineMs) return;
    const left = Math.max(0, Math.ceil((unlockTaskDeadlineMs - clock) / 1000));
    if (left > 0) return;
    if (unlockTaskTimedOutRef.current) return;
    unlockTaskTimedOutRef.current = true;
    void (async () => {
      await failUnlockTask("timeout");
      unlockTaskTimedOutRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, clueUnlocked, unlockTaskDeadlineMs, unlockTaskStage]);

  // Core state is from useHuntsCore(); keep refs in sync for code below that reads them
  activeHuntIdRef.current = activeHuntId;
  huntHasStartedRef.current = huntHasStarted;

  // After restore: when user has passed waypoints (keys >= 1) and is in hunt phase with no destination set, suggest the next waypoint so the first one isn’t shown.
  useEffect(() => {
    if (huntPhase !== "hunt" || keys < 1 || keys >= keysToWin) return;
    if (pendingDestination || destination || isTraveling) return;
    const next = huntNextLocations[keys] ?? null;
    if (!next) return;
    setPendingDestination(next.to);
    setPendingDestinationLabel(next.label);
    setDestinationLabel(shortenPlaceLabel(next.label));
  }, [huntPhase, keys, keysToWin, huntNextLocations, pendingDestination, destination, isTraveling]);

  // On reload: restore target label when it's empty but we have a current waypoint (so the HUD doesn't stay blank).
  useEffect(() => {
    if (huntPhase !== "hunt" || keys >= keysToWin) return;
    if (destinationLabel) return;
    const next = huntNextLocations[keys] ?? null;
    if (!next) return;
    setDestinationLabel(shortenPlaceLabel(next.label));
  }, [huntPhase, keys, keysToWin, huntNextLocations, destinationLabel]);

  // Record winner once when keys reach win threshold so admin can list winners per hunt.
  useEffect(() => {
    if (!activeHuntId || !user?.id) return;
    if (keys < keysToWin || keysToWin <= 0) return;
    const winnerKey = `${activeHuntId}:${user.id}`;
    if (winnerRecordedRef.current === winnerKey) return;
    winnerRecordedRef.current = winnerKey;
    fetch("/api/hunt/record-winner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hunt_id: activeHuntId,
        keys,
        keys_to_win: keysToWin,
      }),
    }).catch(() => {
      // Allow retry on next render if request fails.
      winnerRecordedRef.current = null;
    });
  }, [activeHuntId, user?.id, keys, keysToWin]);

  const isUserCompletedHunt = keysToWin > 0 && keys >= keysToWin;

  // Once user completes hunt, close modal stack and fetch completion placement/result.
  useEffect(() => {
    if (!isUserCompletedHunt) return;
    setDrawer(null);
  }, [isUserCompletedHunt, setDrawer]);

  useEffect(() => {
    if (!isUserCompletedHunt) {
      setCompletionConfettiVisible(false);
      return;
    }
    setCompletionConfettiVisible(true);
    const t = window.setTimeout(() => setCompletionConfettiVisible(false), 5000);
    return () => window.clearTimeout(t);
  }, [isUserCompletedHunt]);

  useEffect(() => {
    if (!isUserCompletedHunt || !activeHuntId) return;
    let cancelled = false;
    const fetchResult = async () => {
      try {
        const res = await fetch(
          `/api/hunt/completion-result?hunt_id=${encodeURIComponent(activeHuntId)}&_=${Date.now()}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => null)) as {
          placement?: number | null;
          isWinner?: boolean | null;
          winnersCount?: number | null;
        } | null;
        if (cancelled || !res.ok || !data) return;
        setCompletionResult({
          placement: Number.isFinite(data.placement) ? Number(data.placement) : null,
          isWinner: typeof data.isWinner === "boolean" ? data.isWinner : null,
          winnersCount: Number.isFinite(data.winnersCount) ? Number(data.winnersCount) : null,
        });
      } catch {
        // ignore and retry on next tick while completed screen is shown
      }
    };
    void fetchResult();
    const t = window.setInterval(() => {
      if (completionResult?.placement != null) return;
      void fetchResult();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isUserCompletedHunt, activeHuntId, completionResult?.placement]);

  // Cross-tab sync: subscribe to our position row so the other tab/browser gets updates
  useEffect(() => {
    if (!activeHuntId || !user?.id || !supabase) return;
    const channel = supabase
      .channel(`hunt-${activeHuntId}-position-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_positions",
          filter: `hunt_id=eq.${activeHuntId}`,
        },
        (payload: { eventType: string; new: { player_id: string; lng: number; lat: number; keys?: number; travel_mode?: string } }) => {
          if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") return;
          const row = payload.new;
          // When any player in the hunt gets an update (e.g. keys), light leaderboard so everyone sees
          if (row.player_id !== user.id) {
            setNavNotifications((prev: typeof navNotifications) => ({ ...prev, leaderboard: true }));
            return;
          }
          // Only apply when this tab is not the one moving (avoid overwriting local simulation with stale DB)
          if (isTravelingRef.current) return;
          // During stop/relax/SOS/hospital flows we keep local position authoritative to avoid
          // stale realtime writes pulling the avatar backward (visible jitter at venue arrival).
          if (
            stopFlow?.status === "to_stop" ||
            stopFlow?.status === "relaxing" ||
            stopFlow?.status === "ready_to_pay" ||
            faintPhase != null ||
            hospitalStay != null ||
            isTravellingToHospital
          ) {
            return;
          }
          // Ignore realtime for a short window after we just started travel (our own start upsert would overwrite position)
          if (travelStartedAtRef?.current && Date.now() - travelStartedAtRef.current < (TRAVEL_START_REALTIME_IGNORE_MS ?? 2500)) return;
          // Ignore realtime for a short window after we just arrived (avoids stale position pulling avatar back)
          if (lastArrivalAtRef.current && Date.now() - lastArrivalAtRef.current < ARRIVAL_REALTIME_IGNORE_MS) return;
          const lng = Number(row.lng);
          const lat = Number(row.lat);
          // During prep (walk to pickup, bus wait, car wait), DB lng/lat can lag local simulation / heartbeat
          // and fight setPlayerPos → avatar flicker on Hunts and jumpy broadcast. Still merge keys/travel_mode.
          const skipRealtimePosForPrep = prepPlanRef.current != null;
          if (!skipRealtimePosForPrep && Number.isFinite(lng) && Number.isFinite(lat)) {
            setPlayerPos({ lng, lat });
          }
          // Only accept keys from server if not less than current (avoid stale realtime overwriting a local key award)
          if (typeof row.keys === "number" && row.keys >= 0) {
            setKeys((prev: number) => (row.keys! >= prev ? row.keys! : prev));
          }
          if (row.travel_mode && ["walk", "bicycle", "motorbike", "car", "bus", "plane"].includes(row.travel_mode)) {
            setTravelModeId(row.travel_mode as TravelModeId);
          }
        }
      )
      .subscribe();
    positionRealtimeRef.current = channel;
    return () => {
      positionRealtimeRef.current?.unsubscribe();
      positionRealtimeRef.current = null;
    };
  }, [activeHuntId, user?.id, stopFlow?.status, faintPhase, hospitalStay, isTravellingToHospital]);

  // Fetch per-hunt leaderboard: positions (keys) + registrations (total_spent = loota) + profiles (name, avatar). Rank by keys then loota.
  const fetchHuntLeaderboard = useCallback(async () => {
    if (!activeHuntId || !user?.id || !supabase) return;
    setLeaderboardLoading(true);
    try {
      const [posRes, regRes] = await Promise.all([
        supabase
          .from("player_positions")
          .select("player_id, player_name, keys, travel_mode")
          .eq("hunt_id", activeHuntId),
        supabase
          .from("hunt_registrations")
          .select("player_id, keys_earned, total_spent")
          .eq("hunt_id", activeHuntId),
      ]);
      const positions = (posRes.data ?? []) as Array<{
        player_id: string;
        player_name?: string;
        keys?: number;
        travel_mode?: string;
      }>;
      const registrations = (regRes.data ?? []) as Array<{
        player_id: string;
        keys_earned?: number;
        total_spent?: number;
      }>;
      const playerIds = Array.from(
        new Set([
          ...positions.map((p) => p.player_id),
          ...registrations.map((r) => r.player_id),
        ])
      ).filter(Boolean);
      const regByPlayer = new Map(registrations.map((r) => [r.player_id, r]));
      const posByPlayer = new Map(positions.map((p) => [p.player_id, p]));

      let profiles: Array<{ user_id: string; username?: string; avatar_url?: string }> = [];
      if (playerIds.length > 0) {
        const { data } = await supabase
          .from("player_profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", playerIds);
        profiles = (data ?? []) as Array<{ user_id: string; username?: string; avatar_url?: string }>;
      }
      const profileByPlayer = new Map(profiles.map((p) => [p.user_id, p]));

      const travelModesList = ["walk", "bicycle", "motorbike", "car", "bus", "plane"];

      const list = playerIds.map((playerId) => {
        const pos = posByPlayer.get(playerId);
        const reg = regByPlayer.get(playerId);
        const prof = profileByPlayer.get(playerId);
        const keys = typeof pos?.keys === "number" && pos.keys >= 0 ? pos.keys : (reg?.keys_earned ?? 0);
        const loota = Math.round(Number(reg?.total_spent ?? 0) || 0);
        const name = pos?.player_name ?? prof?.username ?? "Hunter";
        const avatarUrl = prof?.avatar_url ?? (playerId === user.id ? youAvatarUrl : undefined);
        const travelMode = pos?.travel_mode && travelModesList.includes(pos.travel_mode) ? pos.travel_mode : "walk";
        const you = playerId === user.id;
        return {
          id: playerId,
          name,
          avatarUrl: avatarUrl ?? `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(playerId)}`,
          keys,
          loota,
          inventory: [], // "you" row inventory is filled in leaderboardRows useMemo (after ownedModes is defined)
          currentMode: travelMode,
          traveling: false,
          you,
        };
      });

      // For "you" row use local keys so leaderboard is up to date
      const youIdx = list.findIndex((r) => r.you);
      if (youIdx >= 0) list[youIdx]!.keys = keys;

      list.sort((a, b) => (b.keys !== a.keys ? b.keys - a.keys : b.loota - a.loota));
      const rank = list.findIndex((r) => r.you) + 1 || 1;
      setHuntLeaderboard({ list, rank });
    } catch (e) {
      console.warn("[Hunts] fetchHuntLeaderboard error", e);
      setHuntLeaderboard(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [activeHuntId, user?.id, supabase, youAvatarUrl]);

  useEffect(() => {
    if (!activeHuntId || !user?.id) return;
    fetchHuntLeaderboard();
  }, [activeHuntId, user?.id, fetchHuntLeaderboard]);

  // Refetch leaderboard when drawer opens so it's fresh
  useEffect(() => {
    if (drawer === "leaderboard" && activeHuntId && user?.id) {
      fetchHuntLeaderboard();
    }
  }, [drawer, activeHuntId, user?.id, fetchHuntLeaderboard]);

  // Lock vertical scroll on mobile/tablet so hunts is one fixed view (same as desktop)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
    };
  }, []);

  // Keep latest hunts map zoom + width for player_positions (broadcast matches this player's view).
  useEffect(() => {
    if (!mapReady) return;
    const id = window.setInterval(() => {
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
    }, 350);
    return () => clearInterval(id);
  }, [mapReady]);

  // Save position is handled by subsequent sync/heartbeat effects below.

  // When keys increase (e.g. after clicking Continue), save position immediately so DB and next location stay in sync without needing a reload.
  // IMPORTANT: always include travel_* fields so we don't wipe broadcast animation data.
  const keysPrevForSaveRef = useRef(keys);
  useEffect(() => {
    if (keys <= keysPrevForSaveRef.current) {
      keysPrevForSaveRef.current = keys;
      return;
    }
    if (!activeHuntId || !user?.id || !supabase || !playerPositionsHydrated || !playerPos || anotherDeviceActive) return;
    keysPrevForSaveRef.current = keys;
    const playerName = (profile?.username as string) || "Player";
    const payload = getTravelBroadcastPayloadForDb();
    const base: Record<string, unknown> = {
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerName,
            lng: playerPos.lng,
            lat: playerPos.lat,
            keys,
            travel_mode: travelModeId,
            constraint_state: stopFlow && (stopFlow.status === "to_stop" || stopFlow.status === "relaxing" || stopFlow.status === "ready_to_pay") ? {
              status: stopFlow.status,
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
              startedAt: stopFlow.startedAt,
            } : null,
            active_client_id: getClientId(),
            last_active_at: new Date().toISOString(),
    };
    if (payload) {
      base.travel_started_at = payload.startedAt;
      base.travel_route_coords = payload.routeCoords;
      base.travel_duration_ms = payload.durationMs;
    } else {
      base.travel_started_at = null;
      base.travel_duration_ms = null;
    }
    refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
    Object.assign(base, getHuntsMapCameraDbFields());
    supabase
      .from("player_positions")
      .upsert(base as any, { onConflict: "hunt_id,player_id" })
      .then((result: { error: unknown }) => {
        if (result.error) console.warn("[Hunts] save position (keys update) error", result.error);
      });
  }, [keys, activeHuntId, user?.id, supabase, playerPositionsHydrated, playerPos?.lng, playerPos?.lat, travelModeId, profile?.username, anotherDeviceActive, stopFlow]);

  // While traveling, push position + same route/duration to DB so broadcast (and mobile) stays on exact path; include constraint/quiz state
  useEffect(() => {
    if (!isTraveling || !activeHuntId || !user?.id || !supabase || !playerPositionsHydrated || anotherDeviceActive) return;
    const playerName = (profile?.username as string) || "Player";
    const payload = getTravelBroadcastPayloadForDb();
    const interval = setInterval(() => {
      const pos = travelSyncPosRef.current;
      if (!pos) return;
      const constraintPayload =
        stopFlow && (stopFlow.status === "to_stop" || stopFlow.status === "relaxing" || stopFlow.status === "ready_to_pay")
          ? {
              status: stopFlow.status,
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
              startedAt: stopFlow.startedAt,
            }
          : travelPause?.kind === "bus_stop"
            ? {
                // Broadcast should reflect bus alighting/boarding immediately, like other stop constraints.
                status: "relaxing",
                kind: "rest",
                stop: {
                  place_name: travelPause.label || "Bus stop",
                  center: [pos.lng, pos.lat],
                },
                startedAt: travelPause.startedAt,
              }
            : null;
      const base: Record<string, unknown> = {
        hunt_id: activeHuntId,
        player_id: user.id,
        player_name: playerName,
        lng: pos.lng,
        lat: pos.lat,
        keys,
        travel_mode: travelModeId,
        constraint_state: constraintPayload,
        narrator_state: narratorStateRef.current ?? null,
        active_client_id: getClientId(),
        last_active_at: new Date().toISOString(),
      };
      if (payload) {
        base.travel_started_at = payload.startedAt;
        base.travel_route_coords = payload.routeCoords;
        base.travel_duration_ms = payload.durationMs;
      }
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
      Object.assign(base, getHuntsMapCameraDbFields());
      supabase
        .from("player_positions")
        .upsert(base as any, { onConflict: "hunt_id,player_id" })
        .then((result: { error: unknown }) => {
          if (result.error) console.warn("[Hunts] travel position sync error", result.error);
        });
    }, 1500);
    return () => clearInterval(interval);
  }, [isTraveling, activeHuntId, user?.id, playerPositionsHydrated, keys, travelModeId, profile?.username, anotherDeviceActive, stopFlow, travelPause]);

  // Keep a stable ref for heartbeat so we can avoid including `stopFlow` in this effect's dependency list.
  const stopFlowRef = useRef(stopFlow);
  useEffect(() => {
    stopFlowRef.current = stopFlow;
  }, [stopFlow]);

  // Heartbeat: push constraint/quiz state to DB every 4s so broadcast always receives (captures actions even if other effects skip).
  // IMPORTANT: include travel_* fields when traveling so we don't null them out (broadcast depends on them for avatar movement).
  useEffect(() => {
    if (!activeHuntId || !user?.id || !supabase || !playerPositionsHydrated || anotherDeviceActive) return;
    const playerName = (profile?.username as string) || "Player";
    const interval = setInterval(() => {
      // Critical: when NOT traveling, only ever write the standing avatar position (playerPos).
      // Falling back to travelSyncPosRef can write stale/incorrect coords (e.g. destination) and break broadcast alignment.
      const pos = isTraveling ? (travelSyncPosRef.current ?? playerPos) : playerPos;
      if (!pos) return;
      const sf = stopFlowRef.current;
      const constraintPayload =
        sf && (sf.status === "to_stop" || sf.status === "relaxing" || sf.status === "ready_to_pay")
          ? {
              status: sf.status,
              kind: sf.kind,
              stop: sf.stop,
              restInPlace: sf.restInPlace,
              costCoins: sf.costCoins,
              actionSeconds: sf.actionSeconds,
              finalTo: sf.finalTo,
              finalLabel: sf.finalLabel,
              modeId: sf.modeId,
              isSecondWarning: sf.isSecondWarning,
              coordsToStop: sf.coordsToStop,
              durationSecondsToStop: sf.durationSecondsToStop,
              distanceMetersToStop: sf.distanceMetersToStop,
              resumeCoords: sf.resumeCoords,
              resumeEtaSeconds: sf.resumeEtaSeconds,
              startedAt: sf.startedAt,
            }
          : travelPause?.kind === "bus_stop"
            ? {
                status: "relaxing",
                kind: "rest",
                stop: {
                  place_name: travelPause.label || "Bus stop",
                  center: [pos.lng, pos.lat],
                },
                startedAt: travelPause.startedAt,
              }
          : null;
      const payload = getTravelBroadcastPayloadForDb();
      const base: Record<string, unknown> = {
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerName,
            lng: pos.lng,
            lat: pos.lat,
            keys,
            travel_mode: travelModeId,
        constraint_state: constraintPayload,
        narrator_state: narratorStateRef.current ?? null,
        active_client_id: getClientId(),
        last_active_at: new Date().toISOString(),
      };
      if (payload) {
        base.travel_started_at = payload.startedAt;
        base.travel_route_coords = payload.routeCoords;
        base.travel_duration_ms = payload.durationMs;
      } else {
        base.travel_started_at = null;
        base.travel_duration_ms = null;
      }
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
      Object.assign(base, getHuntsMapCameraDbFields());
      supabase
        .from("player_positions")
        .upsert(base as any, { onConflict: "hunt_id,player_id" })
        .then((r: { error: unknown }) => {
          if (r.error) console.warn("[Hunts] broadcast heartbeat error", r.error);
        });
    }, 4000);
    return () => clearInterval(interval);
  }, [activeHuntId, user?.id, supabase, playerPositionsHydrated, anotherDeviceActive, playerPos?.lng, playerPos?.lat, keys, travelModeId, profile?.username]);

  // When travel ends: clear timing fields so the broadcast knows travel is over; keep route coords for avatar positioning.
  useEffect(() => {
    if (isTraveling || !wasTravelingForBroadcastRef.current || !activeHuntId || !user?.id || !supabase || !playerPositionsHydrated || !playerPos)
      return;
    wasTravelingForBroadcastRef.current = false;
    travelBroadcastPayloadRef.current = null;
    narratorStateRef.current = null;
    const playerName = (profile?.username as string) || "Player";
    refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
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
          travel_started_at: null,
          travel_duration_ms: null,
          narrator_state: null,
            active_client_id: getClientId(),
            last_active_at: new Date().toISOString(),
          ...getHuntsMapCameraDbFields(),
          },
          { onConflict: "hunt_id,player_id" }
        )
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn("[Hunts] broadcast travel end upsert error", error);
        });
  }, [isTraveling, activeHuntId, user?.id, supabase, playerPositionsHydrated, playerPos?.lng, playerPos?.lat, keys, travelModeId, profile?.username]);

  // Multi-device: heartbeat to claim session. Other device sees "You are travelling already"; travelling device sees "Close the other device" and stops.
  useEffect(() => {
    if (!activeHuntId || !user?.id || !supabase) return;
    const STALE_MS = 5000;
    const interval = setInterval(async () => {
      const clientId = getClientId();
      const { data, error } = await supabase.rpc("claim_hunt_session", {
        p_hunt_id: activeHuntId,
        p_player_id: user.id,
        p_client_id: clientId,
        p_stale_ms: STALE_MS,
        p_competing_window_ms: 10000,
      });
      if (error) {
        console.warn("[Hunts] claim_hunt_session error", error);
        return;
      }
      const claimed = data?.claimed === true;
      const anotherSeen = data?.another_device_seen === true;
      if (!claimed) {
        setOtherDeviceRole("secondary");
        // Stop travel on this tab too so we don't show a moving avatar while saying "You are travelling already"
        travelRef.current = null;
        setIsTraveling(false);
        setProgress(0);
        setRouteCoords([]);
        setDestination(null);
      } else if (anotherSeen) {
        setOtherDeviceRole("primary");
        travelRef.current = null;
        setIsTraveling(false);
        setProgress(0);
        setRouteCoords([]);
        setDestination(null);
      } else {
        setOtherDeviceRole(null);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeHuntId, user?.id]);

  function resetDestinationSearch() {
    // Abort any in-flight request
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
  }

  function resetClueSearch() {
    if (clueDebounceRef.current) {
      window.clearTimeout(clueDebounceRef.current);
      clueDebounceRef.current = null;
    }
    if (clueAbortRef.current) {
      clueAbortRef.current.abort();
      clueAbortRef.current = null;
    }
    setClueQuery("");
    setClueResults([]);
    setClueError(null);
    setClueLoading(false);
  }

  function startRpsChallenge() {
    rpsAwardedRef.current = false;
    setRps({ your: 0, bot: 0, done: false });
  }

  // First step: everyone is sent to the same public location. Set suggested destination only; do not auto-open travel drawer.
  useEffect(() => {
    if (!playerPositionsHydrated) return;
    if (!playerPos) return;
    if (huntPhase !== "public_trip") return;
    if (keys >= 1) return;
    if (publicInitRef.current) return;
    publicInitRef.current = true;

    setDestinationLabel(shortenPlaceLabel(publicLocationLabel));
    setPendingDestination(publicLocation);
    setPendingDestinationLabel(shortenPlaceLabel(publicLocationLabel));
    // Do not setDrawer("travel") — modals stay closed until user opens them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huntPhase, playerPos, playerPositionsHydrated, keys]);

  // Public task setup (intro first; timer starts on "Start").
  useEffect(() => {
    if (huntPhase !== "public_task") {
      setPublicTaskStage("intro");
      setPublicTaskQuestion(null);
      setPublicTaskDeadlineMs(null);
      publicTaskTimedOutRef.current = false;
      return;
    }
    setPublicTaskStage("intro");
    setPublicTaskQuestion(null);
    setPublicTaskDeadlineMs(null);
    setPublicTaskAnswer("");
    setPublicTaskError(null);
    publicTaskTimedOutRef.current = false;
  }, [huntPhase]);

  // Unlock-task setup (intro first; timer starts on "Start").
  useEffect(() => {
    if (!clueUnlocked) {
      setUnlockTaskStage("intro");
      setUnlockTaskQuestion(null);
      setUnlockTaskDeadlineMs(null);
      unlockTaskTimedOutRef.current = false;
      setUnlockAnswer("");
      setUnlockError(null);
      setUnlockCheckpoint(null);
      return;
    }

    // When a key is secured, the unlock task is tied to the current location (checkpoint).
    const stepNumber = Math.max(2, keys + 1);
    const cp: { to: LngLat; label: string; stepNumber: number } | null = playerPos
      ? {
          to: { lng: playerPos.lng, lat: playerPos.lat },
          label: destinationLabel || "Checkpoint",
          stepNumber,
        }
      : null;
    setUnlockCheckpoint((prev: typeof cp) => prev ?? cp);
    setUnlockRetry(null);
    setUnlockTaskStage("intro");
    setUnlockTaskQuestion(null);
    setUnlockTaskDeadlineMs(null);
    unlockTaskTimedOutRef.current = false;
    setUnlockAnswer("");
    setUnlockError(null);
  }, [clueUnlocked, destinationLabel, keys, playerPos]);

  // Reset destination search whenever the drawer closes or opens.
  useEffect(() => {
    const prev = prevDrawerRef.current;
    prevDrawerRef.current = drawer;
    if (prev !== "destination" && drawer === "destination") {
      resetDestinationSearch();
      return;
    }
    if (prev === "destination" && drawer !== "destination") {
      resetDestinationSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer]);

  // Award a key only after the arrival mini-game is won.
  useEffect(() => {
    if (!rps || !rps.done) return;
    if (rps.your <= rps.bot) return;
    if (rpsAwardedRef.current) return;

    rpsAwardedRef.current = true;
    setKeys((k: number) => Math.min(keysToWin, k + 1));
    setArrivedForChallenge(false);
    setArrivalChallengeIntro(true); // Reset intro for next location
    setClueUnlocked(true);
    setUnlockAnswer("");
    setUnlockError(null);
    setUnlockTaskStage("intro");
    setUnlockTaskQuestion(null);
    setUnlockTaskDeadlineMs(null);
    setUnlockTaskAttempt(0);
    // Do not open status — badge will indicate activity so user can open when ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rps, keysToWin]);

  function openDrawer(next: DrawerId) {
    // If the player is in the middle of choosing a trip, keep a way back after shopping.
    if (next === "inventory" || next === "coins") {
      if (drawer === "inventory" && next === "coins") {
        resumeDrawerRef.current = "inventory";
      } else if (drawer === "travel" || drawer === "destination") {
        resumeDrawerRef.current = drawer;
      } else if (pendingDestination) {
        // If a destination is already chosen, returning to travel makes sense.
        resumeDrawerRef.current = "travel";
      }
    }
    setDrawer(next);
  }

  function closeDrawer() {
    const resume = resumeDrawerRef.current;
    resumeDrawerRef.current = null;
    if (drawer === "inventory" || drawer === "coins") {
      if (resume) {
        setDrawer(resume);
        return;
      }
      // Travel is only for starting/change mode; when at waypoint don't auto-open travel — show status (quiz) instead.
      if (pendingDestination) {
        setDrawer(isAtCurrentWaypoint || arrivedForChallenge ? "status" : "travel");
        return;
      }
    }
    // Allow closing the stop/relaxation modal so users can check the route (e.g. on mobile).
    // They can re-open via the bottom-right Stop gateway button.
    setDrawer(null);
  }

  async function findNearestAirport(from: LngLat) {
    // NOTE: Mapbox Geocoding POI results can be sparse in some regions (eg. airports),
    // so we use an OSM/Overpass fallback that searches aerodromes around the player.
    const url = new URL("/api/airports/nearest", window.location.origin);
    url.searchParams.set("lng", String(from.lng));
    url.searchParams.set("lat", String(from.lat));
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "No airport found nearby");
    }
    if (!json?.center || !Array.isArray(json.center) || json.center.length !== 2) {
      throw new Error("No airport found nearby");
    }
    return {
      place_name: String(json.place_name || "Nearest airport"),
      center: [Number(json.center[0]), Number(json.center[1])] as [number, number],
    };
  }

  function planeFareCoins(from: LngLat, to: LngLat) {
    // demo pricing (coins): base + distance component
    const km = haversineKm(from, to);
    const raw = 2000 + km * 25;
    return Math.max(2000, Math.round(raw / 10) * 10);
  }

  function flightEtaSeconds(from: LngLat, to: LngLat) {
    const km = haversineKm(from, to);
    const speedKmh = 800; // typical cruising speed (demo)
    const seconds = (km / speedKmh) * 3600;
    return Math.max(60, Math.round(seconds));
  }

  function normRegionName(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\bstate\b/g, "")
      .replace(/\bfederal capital territory\b/g, "fct")
      .trim();
  }

  async function resolveRegionFeature(pos: LngLat): Promise<{ id: string; name: string } | null> {
    const url = new URL("/api/mapbox/reverse", window.location.origin);
    url.searchParams.set("lng", String(pos.lng));
    url.searchParams.set("lat", String(pos.lat));
    url.searchParams.set("types", "region");
    url.searchParams.set("limit", "3");
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => null);
    const first = json?.features?.find((f: any) => f?.id && f?.place_name);
    if (!first) return null;
    const place = String(first.place_name || "").trim();
    if (!place) return null;
    const name = place.split(",")[0]?.trim() || place;
    return { id: String(first.id), name };
  }

  async function resolveStateBbox(stateName: string): Promise<[number, number, number, number] | null> {
    const url = new URL("/api/mapbox/geocode", window.location.origin);
    url.searchParams.set("q", stateName);
    url.searchParams.set("types", "region");
    url.searchParams.set("limit", "5");
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => null);
    const target = normRegionName(stateName);
    const best =
      json?.features?.find((f: any) => Array.isArray(f?.bbox) && normRegionName(f?.place_name).includes(target)) ||
      json?.features?.find((f: any) => Array.isArray(f?.bbox)) ||
      null;
    const bbox = best?.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) return null;
    const [minLng, minLat, maxLng, maxLat] = bbox.map((x: any) => Number(x)) as any;
    if (![minLng, minLat, maxLng, maxLat].every((n) => Number.isFinite(n))) return null;
    if (maxLng <= minLng || maxLat <= minLat) return null;
    return [minLng, minLat, maxLng, maxLat];
  }

  function insetBbox(bbox: [number, number, number, number], insetPct = 0.08) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const dx = (maxLng - minLng) * insetPct;
    const dy = (maxLat - minLat) * insetPct;
    return [minLng + dx, minLat + dy, maxLng - dx, maxLat - dy] as [number, number, number, number];
  }

  function randomPointInBbox(bbox: [number, number, number, number]): LngLat {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    return {
      lng: minLng + Math.random() * (maxLng - minLng),
      lat: minLat + Math.random() * (maxLat - minLat),
    };
  }

  // Find a point approximately 1km away from the given location
  function findPoint1KmAway(from: LngLat): LngLat {
    return pointAtDistanceKm(from, 1);
  }

  /** Point at a given distance (km) from from, in a random direction. */
  function pointAtDistanceKm(from: LngLat, km: number): LngLat {
    const kmInDegrees = km / 111.0;
    const bearing = Math.random() * 360;
    const bearingRad = (bearing * Math.PI) / 180;
    const latRad = (from.lat * Math.PI) / 180;
    const newLat = from.lat + (kmInDegrees * Math.cos(bearingRad));
    const newLng = from.lng + (kmInDegrees * Math.sin(bearingRad) / Math.cos(latRad));
    return { lat: newLat, lng: newLng };
  }

  /** Quiz-fail penalty: move player 2 km from current location. No reverse geocoding. */
  function penaltyRelocateWithinState(): LngLat | null {
    const from = playerPos;
    if (!from) return null;
    const newPos = pointAtDistanceKm(from, 2);
    setPlayerPos(newPos);
    setToast({
      title: "Wrong answer",
      message: "You’ve been moved 2 km away. Try again.",
    });
    return newPos;
  }

  async function resolveCountryName(pos: LngLat): Promise<string | null> {
    const url = new URL("/api/mapbox/reverse", window.location.origin);
    url.searchParams.set("lng", String(pos.lng));
    url.searchParams.set("lat", String(pos.lat));
    url.searchParams.set("types", "country");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => null);
    const place = String(json?.features?.[0]?.place_name || "").trim();
    if (!place) return null;
    const first = place.split(",")[0]?.trim();
    return first || place;
  }

  async function penaltyRelocateAnywhereInNigeria(from: LngLat, why: string) {
    const minMoveKm = 25;
    for (let i = 0; i < 12; i++) {
      const cand = randomPointInBbox([...NIGERIA_BBOX] as unknown as [number, number, number, number]);
      if (haversineKm(from, cand) < minMoveKm) continue;
      const country = await resolveCountryName(cand);
      if (!country) continue;
      if (!country.toLowerCase().includes("nigeria")) continue;
      setPlayerPos(cand);
      setToast({ title: "Anti-cheat", message: why });
      return;
    }
    setToast({ title: "Anti-cheat", message: why });
  }

  const MONSTER_SAYS_WRONG = [
    "Grrrk… that answer tastes like dust.",
    "Hssss… wrong. The streets just shifted under your feet.",
    "Clack-clack… no, hunter. Wander and think again.",
    "Bwa-ha-ha… the map refuses you.",
    "Snrrt… incorrect. The city laughs back.",
  ] as const;
  const MONSTER_SAYS_TIMEOUT = [
    "Too slow… time chewed your answer.",
    "Tick-tock… your thoughts arrived late.",
    "The clock wins. Try again, hunter.",
    "Out of time… the streets change when you blink.",
    "Seconds gone… the hunt doesn’t wait.",
  ] as const;

  function monsterLine(
    kind: "wrong" | "timeout",
    seed: number,
    stepNumber: number,
    attempt: number,
  ) {
    const bank = kind === "timeout" ? MONSTER_SAYS_TIMEOUT : MONSTER_SAYS_WRONG;
    const idx = hash32(`${seed}:${stepNumber}:${attempt}:${kind}`) % bank.length;
    return bank[idx]!;
  }

  const validateAnswer = useCallback(
    async (
      params:
        | { question: string; correctAnswer: string; playerAnswer: string; options?: string[] }
        | { huntId: string; stepIndex: number; playerAnswer: string }
    ): Promise<{ correct: boolean }> => {
      try {
        const body =
          "huntId" in params
            ? { hunt_id: params.huntId, step_index: params.stepIndex, playerAnswer: params.playerAnswer }
            : {
                question: params.question,
                correctAnswer: params.correctAnswer,
                playerAnswer: params.playerAnswer,
                options: params.options,
              };
        const res = await fetch("/api/hunt/validate-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { correct?: boolean; error?: string };
        if (!res.ok) return { correct: false };
        return { correct: Boolean(data.correct) };
      } catch {
        return { correct: false };
      }
    },
    []
  );

  const getQuestionForStep = useCallback(
    async (stepIndex: number): Promise<{ prompt: string; options?: string[] } | null> => {
      if (!activeHuntId) return null;
      try {
        const url = `/api/hunt/get-question?hunt_id=${encodeURIComponent(activeHuntId)}&step_index=${stepIndex}&_=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store", headers: { Pragma: "no-cache" } });
        if (!res.ok) return null;
        const data = (await res.json()) as { question?: string; options?: string[] };
        return { prompt: data.question ?? "", options: data.options };
      } catch {
        return null;
      }
    },
    [activeHuntId]
  );

  async function failPublicTask(reason: "wrong" | "timeout" | "cheat") {
    const from = playerPos || publicLocation;
    const stepNumber = publicTaskStepNumber;
    const seed = getTaskSeed();

    // Reroute: no modal opens; close all drawers and show feedback via toast.
    if (reason === "wrong" || reason === "timeout") {
      setToast({
        title: "Wrong answer",
        message: `Oh you missed. ${monsterLine(reason, seed, stepNumber, publicTaskAttempt)} You've been moved 2 km away. Travel back to try again.`,
      });
    }

    setPublicTaskFeedback(null);
    setPublicTaskAnswer("");
    setPublicTaskError(null);
    setPublicTaskStage("intro");
    setPublicTaskQuestion(null);
    setPublicTaskDeadlineMs(null);
    setArrivedForChallenge(false);
    setDrawer(null);
    setDestination(null);
    setRouteCoords([]);
    setDestinationLabel("");
    setPendingDestination(null);
    setPendingDestinationLabel("");
    setPublicTaskAttempt((a: number) => a + 1);

    if (reason === "cheat") {
      await penaltyRelocateAnywhereInNigeria(
        from,
        "You reached a locked location without solving. You’ve been moved to a random address in Nigeria.",
      );
    } else {
      const newPos = penaltyRelocateWithinState();
      if (newPos && activeHuntId && user?.id && supabase) {
        lastArrivalAtRef.current = Date.now();
        const playerName = (profile?.username as string) || "Player";
        refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
        supabase
          .from("player_positions")
          .upsert(
            {
              hunt_id: activeHuntId,
              player_id: user.id,
              player_name: playerName,
              lng: newPos.lng,
              lat: newPos.lat,
              keys,
              travel_mode: travelModeId,
              travel_started_at: null,
              travel_route_coords: null,
              travel_duration_ms: null,
              answering_question: false,
              current_question: null,
              question_deadline_at: null,
              active_client_id: getClientId(),
              last_active_at: new Date().toISOString(),
              ...getHuntsMapCameraDbFields(),
            },
            { onConflict: "hunt_id,player_id" }
          )
          .then(({ error }: { error: unknown }) => {
            if (error) console.warn("[Hunts] public-task fail relocate upsert error", error);
          });
      }
    }

    // Re-travel to the public checkpoint to try again; destination set for map/HUD but no modal opens.
    publicInitRef.current = false;
    setHuntPhase("public_trip");
    setPendingDestination(publicLocation);
    setPendingDestinationLabel(shortenPlaceLabel(publicLocationLabel));
    setDestinationLabel(shortenPlaceLabel(publicLocationLabel));
  }

  async function failUnlockTask(reason: "wrong" | "timeout" | "cheat") {
    const cp = unlockCheckpoint;
    const from = playerPos || cp?.to || publicLocation;
    const stepNumber = cp?.stepNumber ?? Math.max(2, keys + 1);
    const seed = getTaskSeed();

    if (reason === "wrong" || reason === "timeout") {
      setToast({
        title: "Wrong answer",
        message: `Oh you missed. ${monsterLine(reason, seed, stepNumber, unlockTaskAttempt)} You've been moved 2 km away. Travel back to try again.`,
      });
    }

    setUnlockTaskFeedback(null);
    setUnlockAnswer("");
    setUnlockError(null);
    setUnlockTaskStage("intro");
    setUnlockTaskQuestion(null);
    setUnlockTaskDeadlineMs(null);
    setArrivedForChallenge(false);
    setDrawer(null);
    setUnlockTaskAttempt((a: number) => a + 1);
    setClueUnlocked(false);

    if (reason === "cheat") {
      await penaltyRelocateAnywhereInNigeria(
        from,
        "You reached a locked location without solving. You’ve been moved to a random address in Nigeria.",
      );
    } else {
      const newPos = penaltyRelocateWithinState();
      if (newPos && activeHuntId && user?.id && supabase) {
        lastArrivalAtRef.current = Date.now();
        const playerName = (profile?.username as string) || "Player";
        refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
        supabase
          .from("player_positions")
          .upsert(
            {
              hunt_id: activeHuntId,
              player_id: user.id,
              player_name: playerName,
              lng: newPos.lng,
              lat: newPos.lat,
              keys,
              travel_mode: travelModeId,
              travel_started_at: null,
              travel_route_coords: null,
              travel_duration_ms: null,
              answering_question: false,
              current_question: null,
              question_deadline_at: null,
              active_client_id: getClientId(),
              last_active_at: new Date().toISOString(),
              ...getHuntsMapCameraDbFields(),
            },
            { onConflict: "hunt_id,player_id" }
          )
          .then(({ error }: { error: unknown }) => {
            if (error) console.warn("[Hunts] unlock-task fail relocate upsert error", error);
          });
      }
    }

    // Re-travel to the checkpoint to try again; destination set for map/HUD but no modal opens.
    if (cp) {
      setUnlockRetry(cp);
      setDestination(null);
      setRouteCoords([]);
      const label = shortenPlaceLabel(cp.label);
      setDestinationLabel(label);
      setPendingDestination(cp.to);
      setPendingDestinationLabel(label);
    }
  }

  /** Location quiz (waypoint) fail: reroute 2 km, no modal opens — close all drawers and show feedback via toast. */
  function failLocationQuiz(reason: "wrong" | "timeout") {
    if (rerouteInProgressRef.current) return;
    rerouteInProgressRef.current = true;
    // Use `keys` in hunt phase so the return target matches progression (same as huntNextLocations[keys] / currentWaypoint).
    // `waypointIndexAtPlayer` is GPS-based and can disagree after UI timing or radius edge cases, which left the wrong label/coords on HUD/travel.
    const idx =
      huntPhase === "hunt" && keys < keysToWin ? keys : waypointIndexAtPlayer;
    if (idx == null) {
      rerouteInProgressRef.current = false;
      return;
    }
    const wp = activeHunt?.waypoints;
    const w = Array.isArray(wp) ? wp[idx] : null;
    const fromList = huntNextLocations[idx];
    const returnTo =
      (fromList?.to && isLngLatInNigeria(fromList.to) ? fromList.to : null) ??
      (w ? (parseWaypointCoords(w) as LngLat | null) : null);
    const returnToLabel =
      (fromList?.label ? String(fromList.label) : null) ??
      (w && (w as { label?: string })?.label ? String((w as { label?: string }).label) : `Checkpoint ${idx + 1}`);
    const seed = getTaskSeed();
    const monster = monsterLine(reason, seed, idx + 1, 0);
    setLocationQuizFailMessage(null);
    setArrivedForChallenge(false);
    setClueUnlocked(false);
    setDrawer(null);
    setDestination(null);
    setRouteCoords([]);
    // User has not "passed" this location. After the reroute/relocation, set this location as the travel destination
    // so the Travel drawer and HUD don't look empty.
    const validReturnTo = returnTo && isLngLatInNigeria(returnTo) ? returnTo : null;
    const label = validReturnTo ? shortenPlaceLabel(returnToLabel) : "";
    setDestinationLabel(label);
    setPendingDestination(validReturnTo);
    setPendingDestinationLabel(label);
    setToast({
      title: "Wrong answer",
      message: `You lose. ${monster} You've been moved 2 km away. Travel back to try again.`,
    });
    const newPos = penaltyRelocateWithinState();
    // Persist relocated position so realtime/stale DB doesn't overwrite and pull avatar back to waypoint (which would re-open quiz).
    if (newPos && activeHuntId && user?.id && supabase) {
      lastArrivalAtRef.current = Date.now();
      const playerName = (profile?.username as string) || "Player";
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
      supabase
        .from("player_positions")
        .upsert(
          {
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerName,
            lng: newPos.lng,
            lat: newPos.lat,
            keys,
            travel_mode: travelModeId,
            travel_started_at: null,
            travel_route_coords: null,
            travel_duration_ms: null,
            answering_question: false,
            current_question: null,
            question_deadline_at: null,
            active_client_id: getClientId(),
            last_active_at: new Date().toISOString(),
            ...getHuntsMapCameraDbFields(),
          },
          { onConflict: "hunt_id,player_id" }
        )
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn("[Hunts] quiz-fail relocate upsert error", error);
        });
    }
    rerouteInProgressRef.current = false;
  }

  useEffect(() => {
    failLocationQuizRef.current = failLocationQuiz;
  });

  // Demo ownership (wire to Supabase/inventory later)
  // Walk is always available; other modes are earned/bought.
  const [ownedModes, setOwnedModes] = useState<Set<TravelModeId>>(
    () => new Set<TravelModeId>(["walk"]),
  );
  const ownedModesRef = useRef(ownedModes);
  useEffect(() => {
    ownedModesRef.current = ownedModes;
  }, [ownedModes]);

  // Auto-finish maintenance/repairs
  useEffect(() => {
    const now = Date.now();
    setVehicleState((prev: any) => {
      let changed = false;
      const next: any = { ...prev };
      for (const id of VEHICLE_IDS) {
        const v = prev[id];
        if ((v.status === "servicing" || v.status === "repairing") && v.untilMs && now >= v.untilMs) {
          next[id] = { ...v, status: "ok", untilMs: undefined, healthPct: 100, warnedLow: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [clock]);

  function canUseOwnedVehicle(id: VehicleId) {
    const owned = ownedModes.has(id);
    if (!owned) return false;
    const v = vehicleState[id];
    return v.status === "ok";
  }

  function vehicleBlockedReason(id: VehicleId) {
    const v = vehicleState[id];
    if (!ownedModes.has(id)) return null;
    if (v.status === "servicing") return "In maintenance";
    if (v.status === "repairing") return "Repairing";
    if (v.status === "broken_needs_tow") return "Broken down";
    return null;
  }

  const yourCurrentModeId = useMemo<TravelModeId>(() => {
    if (planeFlow?.stage === "flying" || planeFlow?.stage === "boarding" || planeFlow?.stage === "disembarking") return "plane";
    if (prep) {
      const walking = Boolean(prepPlanRef.current?.walkDuringPrep);
      return walking ? "walk" : prep.modeId;
    }
    if (isTraveling) {
      return travelRef.current?.modeId ?? travelModeId;
    }
    return travelModeId;
  }, [isTraveling, planeFlow?.stage, prep, travelModeId]);

  // Leaderboard for this hunt only: use fetched data when available; always show current user's keys and inventory.
  const leaderboardRows = useMemo(() => {
    const youInventory = Array.from(ownedModes).sort((a, b) => {
      const order: Record<TravelModeId, number> = {
        walk: 0,
        bicycle: 1,
        motorbike: 2,
        car: 3,
        bus: 4,
        plane: 5,
      };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });
    if (huntLeaderboard) {
      const list = huntLeaderboard.list.map((r: any) =>
        r.you ? { ...r, keys, inventory: youInventory } : r
      );
      list.sort((a: any, b: any) => (b.keys !== a.keys ? b.keys - a.keys : b.loota - a.loota));
      const rank = list.findIndex((r: any) => r.you) + 1 || 1;
      return { list, rank };
    }
    const youRow = {
      id: user?.id ?? "you",
      name: "You",
      avatarUrl: youAvatarUrl,
      keys,
      loota: 0,
      inventory: youInventory,
      currentMode: yourCurrentModeId,
      traveling: Boolean(
        isTraveling ||
          prep ||
          planeFlow?.stage === "flying" ||
          planeFlow?.stage === "boarding" ||
          planeFlow?.stage === "disembarking"
      ),
      you: true,
    };
    return { list: [youRow], rank: 1 };
  }, [
    huntLeaderboard,
    keys,
    user?.id,
    ownedModes,
    yourCurrentModeId,
    isTraveling,
    prep,
    planeFlow?.stage,
    youAvatarUrl,
  ]);

  const inventoryCatalog = useMemo(
    () =>
      [
        {
          id: "bicycle" as const,
          label: "Bicycle",
          icon: "directions_bike",
          buyCost: BUY_COST.bicycle ?? 2500,
          canOwn: true,
        },
        {
          id: "motorbike" as const,
          label: "Motorbike",
          icon: "two_wheeler",
          buyCost: BUY_COST.motorbike ?? 9000,
          canOwn: true,
        },
        {
          id: "car" as const,
          label: "Car",
          icon: "directions_car",
          buyCost: BUY_COST.car ?? 22000,
          canOwn: true,
        },
      ] as const,
    [],
  );

  /** Specs for loadout and selected-mode panel (walk + buyable vehicles). */
  const inventoryModeSpecs = useMemo(
    () =>
      TRAVEL_MODES.filter(
        (m): m is (typeof TRAVEL_MODES)[number] =>
          m.id === "walk" || m.id === "bicycle" || m.id === "motorbike" || m.id === "car"
      ).map((m) => ({ id: m.id, label: m.label, icon: m.icon, speedKmh: m.speedKmh })),
    [],
  );

  const coinPackages = useMemo(
    () =>
      [
        { coins: 2000, amountNgn: 1000 },
        { coins: 5000, amountNgn: 2500 },
        { coins: 10000, amountNgn: 5000 },
      ] as const,
    [],
  );

  async function ensurePaystackLoaded() {
    if (typeof window === "undefined") return false;
    if ((window as any).PaystackPop) return true;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[src="https://js.paystack.co/v1/inline.js"]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Paystack failed to load")));
        return;
      }
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Paystack failed to load"));
      document.body.appendChild(s);
    });
    return Boolean((window as any).PaystackPop);
  }

  async function startPaystackPayment(pkg: { coins: number; amountNgn: number }) {
    setPayError(null);
    setPaystackLoading(true);
    const mode: "free" | "paid" =
      (activeHunt as any)?.pricing_config?.paystackMode === "paid" ? "paid" : "free";
    const key = mode === "paid" ? PAYSTACK_PUBLIC_KEY_PAID : PAYSTACK_PUBLIC_KEY_FREE;
    if (!key) {
      setPayError(
        mode === "paid"
          ? "Missing Paystack public key (PAID_PAYSTACK_PUBLIC_KEY)."
          : "Missing Paystack public key (NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY).",
      );
      setPaystackLoading(false);
      return;
    }
    if (!user?.id) {
      setPayError("You must be signed in to add coins.");
      setPaystackLoading(false);
      return;
    }
    const ref = `loota-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const ok = await ensurePaystackLoaded();
      if (!ok) throw new Error("Paystack did not load");
      const PaystackPop = (window as any).PaystackPop;
      PaystackPop.setup({
        key,
        ref,
        email: user?.email ?? "player@loota.game",
        amount: pkg.amountNgn * 100, // kobo
        currency: "NGN",
        metadata: {
          custom_fields: [
            { display_name: "Coins", variable_name: "coins", value: pkg.coins },
            { display_name: "User", variable_name: "user_id", value: user.id },
            { display_name: "Mode", variable_name: "paystack_mode", value: mode },
          ],
        },
        callback: function () {
          (async function () {
            try {
              const res = await fetch("/api/wallet/add-coins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reference: ref, paystackMode: mode }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok) {
                await refreshProfile?.();
                if (data?.newCredits != null) setCredits(Number(data.newCredits));
              } else {
                setPayError(data?.error ?? "Wallet could not be updated.");
              }
            } catch {
              setPayError("Failed to update wallet.");
            } finally {
              setPaystackLoading(false);
            }
          })();
        },
        onClose: function () {
          setPaystackLoading(false);
        },
      }).openIframe();
    } catch (e: any) {
      setPayError(e?.message || "Paystack failed");
      setPaystackLoading(false);
    }
  }

  async function buyInventoryItem(item: { id: TravelModeId; buyCost: number; canOwn: boolean }) {
    setShopError(null);
    if (!item.canOwn) return;
    if (ownedModes.has(item.id)) return;
    if (credits < item.buyCost) {
      setShopError("Not enough coins. Buy coins to continue.");
      return;
    }
    const newBal = await deductCredits(item.buyCost);
    if (newBal === null) return;
    setOwnedModes((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    if (item.id === "bicycle" || item.id === "motorbike" || item.id === "car") {
      const id = item.id as VehicleId;
      setVehicleState((prev: any) => ({
        ...prev,
        [id]: { healthPct: 100, warnedLow: false, status: "ok" },
      }));
      setToast({
        title: "Vehicle acquired",
        message: "Maintenance will be required as you keep hunting.",
      });
    }
  }

  async function startMaintenance(id: VehicleId) {
    setShopError(null);
    if (!ownedModes.has(id)) return;
    const v = vehicleState[id];
    if (v.status !== "ok") return;
    // Prevent maintenance while vehicle is in use
    if (isTraveling && travelRef.current?.modeId === id) {
      setToast({
        title: "Cannot service while moving",
        message: "You must stop traveling before starting maintenance. Park your vehicle first.",
      });
      return;
    }
    if (v.healthPct > 50) {
      setToast({
        title: "Maintenance not needed",
        message: "Service is only available when vehicle health is 50% or below.",
      });
      return;
    }
    const cost = MAINT_COST[id] ?? 0;
    if (credits < cost) {
      setShopError("Not enough coins for maintenance. Buy coins to continue.");
      openDrawer("coins");
      return;
    }
    const newBal = await deductCredits(cost);
    if (newBal === null) return;
    const now = Date.now();
    const realMs = Math.max(
      6_000,
      Math.round((MAINT_WORLD_SECONDS * 1000) / MAINT_SPEEDUP),
    );
    setVehicleState((prev: any) => ({
      ...prev,
      [id]: { ...prev[id], status: "servicing", untilMs: now + realMs },
    }));
    setToast({ title: "Maintenance started", message: "Vehicle will be ready soon." });
  }

  const [baseDirs, setBaseDirs] = useState<{
    loading: boolean;
    error: string | null;
    networkError?: boolean;
    walking?: { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number };
    cycling?: { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number };
    driving?: {
      coords: Array<[number, number]>;
      durationSeconds: number;
      distanceMeters: number;
      durationTypicalSeconds?: number | null;
      trafficDelaySeconds?: number | null;
      alternate?: {
        coords: Array<[number, number]>;
        durationSeconds: number;
        distanceMeters: number;
      };
    };
  }>({ loading: false, error: null, networkError: false });

  /** When live traffic offers an alternate road, which geometry to use for car/motorbike. */
  const [drivingRouteChoice, setDrivingRouteChoice] = useState<"primary" | "alternate">("primary");

  /** Throttle baseDirs Mapbox calls: only refetch when drawer is open and (pos or dest) changed meaningfully. */
  const lastBaseDirsKeyRef = useRef<string | null>(null);
  /** Refs so the baseDirs effect can read latest pos/dest without depending on object identity (avoids cancel/re-run on every GPS tick). */
  const baseDirsPosRef = useRef<LngLat | null>(null);
  const baseDirsDestRef = useRef<LngLat | null>(null);

  // Init Mapbox map (full screen)
  // NOTE: AuthGuard can delay rendering of the map container,
  // so we retry until the ref is available on the client.
  useEffect(() => {
    let cancelled = false;

    async function initOnceContainerReady() {
      if (!tokenPresent) return;

      if (mapRef.current) {
        // Already initialised
        return;
      }

      if (!mapContainerRef.current) {
        // Container not yet in the DOM (e.g. AuthGuard still resolving).
        // Retry on the next animation frame until it appears.
        if (!cancelled) {
          requestAnimationFrame(initOnceContainerReady);
        }
        return;
      }

      setMapReady(false);

      try {
        const mapboxgl = (await import("mapbox-gl")).default as any;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapboxRef.current = mapboxgl;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          // Use streets-v12 for reliable tile loading; Standard can show blank/dark if config or token limits apply
          style: "mapbox://styles/mapbox/streets-v12",
          // Start with global view focused on Nigeria (whole country visible) before first real position
          center: [8.5, 9.5],
          zoom: 5,
          // Do not clamp the camera to Nigeria.
          // Players may join from anywhere in the world before reaching Nigeria; we still
          // snap the camera to their device position once we have GPS/IP coordinates.
          // Handlers default off in load; pan/zoom are enabled for the active hunt so players can explore before and during travel (avatar position is unchanged).
          interactive: true,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          try {
            addMapboxTrafficLayer(map);
          } catch {
            /* traffic tileset optional */
          }
          // Active hunt leg (Go / resume): line + chevrons under detour layers so stop/hospital preview stays on top.
          if (!map.getSource("main-travel-route")) {
            map.addSource("main-travel-route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [] },
              },
            });
          }
          if (!map.getLayer("main-travel-route-line")) {
            map.addLayer({
              id: "main-travel-route-line",
              type: "line",
              source: "main-travel-route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#16A34A",
                "line-width": 4,
                "line-opacity": 0.92,
              },
            });
          }
          if (!map.getLayer("main-travel-route-direction")) {
            map.addLayer({
              id: "main-travel-route-direction",
              type: "symbol",
              source: "main-travel-route",
              layout: {
                "symbol-placement": "line",
                "symbol-spacing": 56,
                "text-field": "▶",
                "text-size": 14,
                "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-keep-upright": false,
                "text-rotation-alignment": "map",
                "text-pitch-alignment": "viewport",
                visibility: "none",
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#15803d",
                "text-halo-width": 2,
              },
            });
          }
          // Planned route (Travel drawer / pending destination) before tapping Go — same green styling as active leg.
          if (!map.getSource("preview-travel-route")) {
            map.addSource("preview-travel-route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [] },
              },
            });
          }
          if (!map.getLayer("preview-travel-route-line")) {
            map.addLayer({
              id: "preview-travel-route-line",
              type: "line",
              source: "preview-travel-route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#16A34A",
                "line-width": 4,
                "line-opacity": 0.85,
                "line-dasharray": [2, 2],
              },
            });
          }
          if (!map.getLayer("preview-travel-route-direction")) {
            map.addLayer({
              id: "preview-travel-route-direction",
              type: "symbol",
              source: "preview-travel-route",
              layout: {
                "symbol-placement": "line",
                "symbol-spacing": 56,
                "text-field": "▶",
                "text-size": 14,
                "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-keep-upright": false,
                "text-rotation-alignment": "map",
                "text-pitch-alignment": "viewport",
                visibility: "none",
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#15803d",
                "text-halo-width": 2,
              },
            });
          }
          // Detour to stop (relax) or hospital — line + chevrons on top
          if (!map.getSource("detour-route")) {
            map.addSource("detour-route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [] },
              },
            });
          }
          if (!map.getLayer("detour-route-line")) {
            map.addLayer({
              id: "detour-route-line",
              type: "line",
              source: "detour-route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#16A34A",
                "line-width": 4,
              },
            });
          }
          // Chevrons along the detour/hospital line so travel direction is obvious when panning the map.
          if (!map.getLayer("detour-route-direction")) {
            map.addLayer({
              id: "detour-route-direction",
              type: "symbol",
              source: "detour-route",
              layout: {
                "symbol-placement": "line",
                "symbol-spacing": 56,
                "text-field": "▶",
                "text-size": 14,
                "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-keep-upright": false,
                "text-rotation-alignment": "map",
                "text-pitch-alignment": "viewport",
                visibility: "none",
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#15803d",
                "text-halo-width": 2,
              },
            });
          }
          const disableHuntsMapExploreHandlers = () => {
            try {
              map.dragPan?.disable?.();
              map.scrollZoom?.disable?.();
              map.touchZoomRotate?.disable?.();
              map.doubleClickZoom?.disable?.();
              map.boxZoom?.disable?.();
              map.keyboard?.disable?.();
              map.dragRotate?.disable?.();
            } catch {
              /* ignore */
            }
          };
          disableHuntsMapExploreHandlers();
          map.resize(); // Ensure map fills container (fixes blank map if container was 0-sized at init)
          setMapReady(true);
        });

        map.on("error", (e: any) => {
          console.error("[Hunts] mapbox error", e);
        });
      } catch (err) {
        console.error("[Hunts] failed to init map", err);
      }
    }

    initOnceContainerReady();

    return () => {
      cancelled = true;
      initialHuntsCameraSnapRef.current = false;
      try {
        mapRef.current?.remove?.();
      } catch {}
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [startLocation.lat, startLocation.lng, tokenPresent]);

  // Update the preset occasionally (in case the user's local time crosses thresholds while playing)
  useEffect(() => {
    const t = window.setInterval(() => {
      setLightPreset(lightPresetForLocalTime());
    }, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  // Apply preset to the live map if supported
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.setConfigProperty !== "function") return;
    try {
      map.setConfigProperty("basemap", "lightPreset", lightPreset);
    } catch {
      // ignore if style/config isn't ready yet
    }
  }, [lightPreset, mapReady]);

  // During an active hunt, allow pan/zoom anytime so players can scout the map before Go and along routes; pause camera follow after user input.
  const ROUTE_EXPLORE_PAUSE_MS = 8000;
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const allowExplore = Boolean(activeHuntId && huntFetchDone);

    const markExploreInteraction = () => {
      huntsRouteExplorePauseAtRef.current = Date.now();
    };

    if (allowExplore) {
      try {
        map.dragPan?.enable?.();
        map.scrollZoom?.enable?.();
        map.touchZoomRotate?.enable?.();
      } catch {
        /* ignore */
      }
      try {
        map.on?.("dragstart", markExploreInteraction);
        map.on?.("zoomstart", markExploreInteraction);
        map.on?.("rotatestart", markExploreInteraction);
        map.on?.("pitchstart", markExploreInteraction);
      } catch {
        /* ignore */
      }
      return () => {
        try {
          map.off?.("dragstart", markExploreInteraction);
          map.off?.("zoomstart", markExploreInteraction);
          map.off?.("rotatestart", markExploreInteraction);
          map.off?.("pitchstart", markExploreInteraction);
        } catch {
          /* ignore */
        }
        try {
          map.dragPan?.disable?.();
          map.scrollZoom?.disable?.();
          map.touchZoomRotate?.disable?.();
        } catch {
          /* ignore */
        }
      };
    }

    try {
      map.dragPan?.disable?.();
      map.scrollZoom?.disable?.();
      map.touchZoomRotate?.disable?.();
    } catch {
      /* ignore */
    }
    return;
  }, [mapReady, activeHuntId, huntFetchDone]);

  // Main travel polyline + direction chevrons (active leg only; not ambulance/hospital).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("main-travel-route") as
      | { setData: (data: GeoJSON.Feature<GeoJSON.LineString>) => void }
      | undefined;
    if (!source?.setData) return;

    const showMainTravel = Boolean(isTraveling && !isTravellingToHospital);
    const coords =
      showMainTravel && travelRef.current?.coords && travelRef.current.coords.length >= 2
        ? travelRef.current.coords
        : [];
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
    try {
      map.setLayoutProperty(
        "main-travel-route-direction",
        "visibility",
        coords.length >= 2 ? "visible" : "none",
      );
    } catch {
      /* layer may not exist yet */
    }
  }, [mapReady, isTraveling, isTravellingToHospital, travelPause]);

  // Draw route line: red for hospital, blue for relaxation (rejuvenate/refuel/rest)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("detour-route") as { setData: (data: GeoJSON.Feature<GeoJSON.LineString>) => void } | undefined;
    if (!source?.setData) return;

    const showDetour =
      (stopFlow?.status === "to_stop" &&
        (stopFlow.kind === "rejuvenate" || stopFlow.kind === "refuel" || stopFlow.kind === "rest") &&
        !stopFlow?.restInPlace) ||
      isTravellingToHospital;
    const coordinates = showDetour && routeCoords.length >= 2 ? routeCoords : [];
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
    const lineColor = isTravellingToHospital ? "#DC2626" : "#16A34A";
    const haloColor = isTravellingToHospital ? "#DC2626" : "#15803d";
    try {
      map.setPaintProperty("detour-route-line", "line-color", lineColor);
    } catch {
      // layer may not exist yet
    }
    try {
      map.setLayoutProperty(
        "detour-route-direction",
        "visibility",
        coordinates.length >= 2 ? "visible" : "none",
      );
      map.setPaintProperty("detour-route-direction", "text-halo-color", haloColor);
    } catch {
      /* layer may not exist yet */
    }
  }, [mapReady, stopFlow?.status, stopFlow?.kind, routeCoords, isTravellingToHospital]);

  // Update markers & route when state changes
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;
    const Marker = mapboxgl.Marker;

    // Use player position, or neutral Nigeria center until GPS/join/session gives coords (do not place avatar on first waypoint).
    // When a route is visible (blue line), avatar must be at route start — playerPos can be stale/GPS and miles off.
    const showDetour =
      (stopFlow?.status === "to_stop" &&
        (stopFlow.kind === "rejuvenate" || stopFlow.kind === "refuel" || stopFlow.kind === "rest") &&
        !stopFlow?.restInPlace) ||
      isTravellingToHospital;
    const routeStart =
      showDetour && routeCoords.length >= 2
        ? { lng: routeCoords[0]![0], lat: routeCoords[0]![1] }
        : null;
    const pos =
      routeStart ??
      (playerPos ?? startLocation);
    if (!pos) return;

    const useAmbulanceMarker = Boolean(isTravellingToHospital);
    if (
      !youMarkerRef.current ||
      youMarkerIsAmbulanceRef.current !== useAmbulanceMarker
    ) {
      if (youMarkerRef.current) {
        try {
          youMarkerRef.current.remove?.();
        } catch {}
        youMarkerRef.current = null;
      }
      youMarkerIsAmbulanceRef.current = useAmbulanceMarker;
      youMarkerRef.current = new Marker({
        element: useAmbulanceMarker
          ? makeAmbulanceWithAvatarEl(youAvatarUrl)
          : makeAvatarEl(youAvatarUrl, "#2563EB"),
      })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map);
    } else {
      // When traveling, RAF loop drives position; don't overwrite with playerPos (can be stale).
      // During prep walk, the 50ms interval sets the marker directly; skip React-driven setLngLat so
      // brief playerPos desync (e.g. before heartbeat catches up) doesn't jitter the avatar.
      const prepWalkDrivesMarker = Boolean(
        prepPlanRef.current?.walkDuringPrep && prepWalkRef.current,
      );
      if ((!isTraveling || isTravellingToHospital) && !prepWalkDrivesMarker) {
        youMarkerRef.current.setLngLat([pos.lng, pos.lat]);
      }
    }

    // Show travel mode badge while moving (not when in ambulance).
    const rootEl = youMarkerRef.current?.getElement?.() as HTMLElement | undefined;
    const badgeWrap = rootEl?.querySelector?.("[data-mode-badge-wrap]") as HTMLElement | null;
    const badgeIcon = rootEl?.querySelector?.("[data-mode-badge]") as HTMLElement | null;
    const sosEl = rootEl?.querySelector?.("[data-sos]") as HTMLElement | null;

    if (badgeWrap && badgeIcon && !useAmbulanceMarker) {
      const isFainted = Boolean(faintPhase);
      const isWalkingPrep = Boolean(prepPlanRef.current?.walkDuringPrep);
      const show = isFainted || isTraveling || isWalkingPrep;

      if (show) {
        badgeWrap.style.display = "grid";
        if (isFainted) {
          badgeIcon.textContent = "add";
          badgeIcon.style.color = "#DC2626";
          badgeIcon.style.transform = "";
        } else if (faintDangerActive) {
          badgeIcon.style.color = "#DC2626";
          if (isWalkingPrep) {
            badgeIcon.textContent = "directions_walk";
          } else {
            const mode = TRAVEL_MODES.find((m) => m.id === yourCurrentModeId) ?? TRAVEL_MODES[0];
            badgeIcon.textContent = yourCurrentModeId === "walk" ? "directions_walk" : mode.icon;
          }
      const prev = prevMovePosRef.current;
      if (prev) {
        const movedKm = haversineKm(prev, pos);
        if (movedKm > 0.003) lastMoveBearingRef.current = bearingDeg(prev, pos);
      }
      if (!isWalkingPrep && yourCurrentModeId === "plane") {
        badgeIcon.style.transform = `rotate(${lastMoveBearingRef.current - 45}deg)`;
        badgeIcon.style.transformOrigin = "50% 50%";
      } else {
        badgeIcon.style.transform = "";
      }
    } else {
      badgeIcon.style.color = "#0F172A";
      // During walk-to-pickup, always show walking icon.
      if (isWalkingPrep) {
        badgeIcon.textContent = "directions_walk";
      } else {
        const mode = TRAVEL_MODES.find((m) => m.id === yourCurrentModeId) ?? TRAVEL_MODES[0];
        badgeIcon.textContent = yourCurrentModeId === "walk" ? "directions_walk" : mode.icon;
      }
      // Rotate plane badge to face direction of movement.
      const prev = prevMovePosRef.current;
      if (prev) {
        const movedKm = haversineKm(prev, pos);
        if (movedKm > 0.003) {
          lastMoveBearingRef.current = bearingDeg(prev, pos);
        }
      }
          if (!isWalkingPrep && yourCurrentModeId === "plane") {
            badgeIcon.style.transform = `rotate(${lastMoveBearingRef.current - 45}deg)`;
            badgeIcon.style.transformOrigin = "50% 50%";
          } else {
            badgeIcon.style.transform = "";
          }
        }
      } else {
        badgeWrap.style.display = "none";
        badgeIcon.textContent = "";
        badgeIcon.style.transform = "";
      }
    }

    // SOS indicator when stuck without enough coins to continue.
    if (sosEl) {
      sosEl.style.display = sosActive ? "inline-flex" : "none";
    }

    if (isTraveling) prevMovePosRef.current = pos;
    else prevMovePosRef.current = null;
  }, [mapReady, playerPos, youAvatarUrl, isTraveling, yourCurrentModeId, sosActive, faintPhase, faintDangerActive, isTravellingToHospital, startLocation, routeCoords, stopFlow?.status, stopFlow?.kind, stopFlow?.restInPlace]);

  // Avatar position during travel: interpolate along route (route start = avatar start). Never use playerPos when traveling — it can be stale or from GPS.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !youMarkerRef.current) return;
    if (!isTraveling || isTravellingToHospital) return; // Faint/hospital uses separate ambulance marker
    const tr = travelRef.current;
    if (!tr?.coords || tr.coords.length < 2) return;

    let rafId: number;
    const tick = () => {
      const marker = youMarkerRef.current;
      if (!marker) return;
      const t = travelRef.current;
      if (!t?.coords || t.coords.length < 2) return;
      // Bus stop/alighting pause: freeze marker so the "bus doesn't stop" bug is fixed.
      if (travelPause) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const pos = positionAlongRoute(t.coords, t.startedAt, t.durationMs);
      marker.setLngLat([pos.lng, pos.lat]);
      prevMovePosRef.current = pos; // For bearing/badge in marker effect
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady, isTraveling, isTravellingToHospital, travelPause]);

  // While traveling, keep the camera on the same interpolated position as the avatar (RAF marker tick).
  // The old playerPos + useEffect path used 250ms state updates vs 60fps marker = stepped camera + stacked easeTo = flicker on fast modes.
  // Intervals/durations aligned with `broadcast/[huntId]/page.tsx` focused follow.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!isTraveling || isTravellingToHospital) return;

    const map = mapRef.current;
    const CAMERA_INTERVAL_TRAVEL_MS = 900;
    const CAMERA_PLANE_INTERVAL_MS = 1400;
    const CAMERA_EASE_DURATION = 2200;

    let rafId: number;

    const tick = () => {
      if (!isTravelingRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const tr = travelRef.current;
      if (!tr?.coords || tr.coords.length < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      // Bus stop/alighting pause: keep camera still so it matches the frozen avatar.
      if (travelPause) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      if (now - huntsRouteExplorePauseAtRef.current < ROUTE_EXPLORE_PAUSE_MS) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const lastMoveAt = huntsTravelCameraLastMoveAtRef.current;
      if (lastMoveAt > 0 && now - lastMoveAt < (tr.modeId === "plane" ? CAMERA_PLANE_INTERVAL_MS : CAMERA_INTERVAL_TRAVEL_MS)) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const pos = positionAlongRoute(tr.coords, tr.startedAt, tr.durationMs);
      const isPlane = tr.modeId === "plane";
      const desiredZoom = isPlane ? 6.8 : 14;
      const currentZoom = typeof map.getZoom === "function" ? (map.getZoom() as number) : desiredZoom;
      const includeZoom = Number.isFinite(currentZoom) && Math.abs(currentZoom - desiredZoom) > 0.35;
      const center = [pos.lng, pos.lat] as [number, number];

      try {
        if (typeof (map as { stop?: () => void }).stop === "function") {
          (map as { stop: () => void }).stop();
        }
      } catch {
        /* ignore */
      }

      if (includeZoom) {
        map.easeTo({
          center,
          zoom: desiredZoom,
          duration: CAMERA_EASE_DURATION,
          bearing: 0,
          pitch: 0,
        });
      } else {
        map.easeTo({ center, duration: CAMERA_EASE_DURATION, bearing: 0, pitch: 0 });
      }
      huntsTravelCameraLastMoveAtRef.current = now;
      lastCameraEaseAtRef.current = now;
      rafId = requestAnimationFrame(tick);
    };

    huntsTravelCameraLastMoveAtRef.current = 0;
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      huntsTravelCameraLastMoveAtRef.current = 0;
    };
  }, [mapReady, isTraveling, isTravellingToHospital, travelPause]);

  // Faint phase: ambulance moves from 2 km away to user over 2 min, then we route to hospital
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker || !faintPhase) {
      if (ambulanceMarkerRef.current) {
        try {
          ambulanceMarkerRef.current.remove?.();
        } catch {}
        ambulanceMarkerRef.current = null;
      }
      return;
    }
    const Marker = mapboxgl.Marker;
    const { at, startedAt, ambulanceArrivalMs, routeCoords, forwardTo } = faintPhase;

    // Build path along route: ambulance starts 2 km back (or at route start) and moves to user.
    const AMBULANCE_BACK_KM = 2;
    let path: Array<{ lng: number; lat: number }> = [];
    let pathDistKm = 0;
    if (routeCoords.length >= 2) {
      const cumKm: number[] = [0];
      for (let i = 1; i < routeCoords.length; i++) {
        const a = { lng: routeCoords[i - 1][0], lat: routeCoords[i - 1][1] };
        const b = { lng: routeCoords[i][0], lat: routeCoords[i][1] };
        cumKm.push(cumKm[i - 1] + haversineKm(a, b));
      }
      const totalRouteKm = cumKm[cumKm.length - 1] ?? 0;
      // Project user position onto route: find closest point and its distance along route.
      let userKm = 0;
      let bestD = Infinity;
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const a = { lng: routeCoords[i][0], lat: routeCoords[i][1] };
        const b = { lng: routeCoords[i + 1][0], lat: routeCoords[i + 1][1] };
        const segKm = cumKm[i + 1]! - cumKm[i]! || 1e-9;
        const dToA = haversineKm(at, a);
        const dToB = haversineKm(at, b);
        const dSeg = haversineKm(a, b) || 1e-9;
        const t = clamp(
          (dToA * dToA + dSeg * dSeg - dToB * dToB) / (2 * dSeg * dSeg),
          0,
          1,
        );
        const proj = {
          lng: a.lng + (b.lng - a.lng) * t,
          lat: a.lat + (b.lat - a.lat) * t,
        };
        const d = haversineKm(at, proj);
        if (d < bestD) {
          bestD = d;
          userKm = cumKm[i]! + t * segKm;
        }
      }
      const startKm = Math.max(0, userKm - AMBULANCE_BACK_KM);
      const pointAtKm = (km: number): { lng: number; lat: number } => {
        const k = clamp(km, 0, totalRouteKm);
        let j = 1;
        while (j < cumKm.length && cumKm[j]! < k) j++;
        j = clamp(j, 1, cumKm.length - 1);
        const prevKm = cumKm[j - 1]!;
        const segKm = cumKm[j]! - prevKm || 1e-9;
        const localT = clamp((k - prevKm) / segKm, 0, 1);
        const a = routeCoords[j - 1]!;
        const b = routeCoords[j]!;
        return { lng: a[0] + (b[0] - a[0]) * localT, lat: a[1] + (b[1] - a[1]) * localT };
      };
      path = [pointAtKm(startKm)];
      for (let j = 0; j < routeCoords.length; j++) {
        const km = cumKm[j]!;
        if (km > startKm && km < userKm) path.push({ lng: routeCoords[j]![0], lat: routeCoords[j]![1] });
      }
      path.push(at);
      pathDistKm = 0;
      for (let i = 1; i < path.length; i++) {
        pathDistKm += haversineKm(path[i - 1]!, path[i]!);
      }
    }
    if (path.length < 2) {
      const start = destinationPointFromBearing(at, AMBULANCE_BACK_KM, 0);
      path = [start, at];
      pathDistKm = AMBULANCE_BACK_KM;
    }
    const start = path[0]!;

    if (!ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current = new Marker({ element: makeAmbulanceEl() })
        .setLngLat([start.lng, start.lat])
        .addTo(map);
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / ambulanceArrivalMs);
      let acc = 0;
      const targetD = t * pathDistKm;
      let pos = path[0]!;
      for (let i = 1; i < path.length; i++) {
        const segD = haversineKm(path[i - 1]!, path[i]!);
        if (acc + segD >= targetD) {
          const localT = segD > 0 ? (targetD - acc) / segD : 1;
          const a = path[i - 1]!;
          const b = path[i]!;
          pos = { lng: a.lng + (b.lng - a.lng) * localT, lat: a.lat + (b.lat - a.lat) * localT };
          break;
        }
        acc += segD;
        pos = path[i]!;
      }
      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.setLngLat([pos.lng, pos.lat]);
      }
      if (elapsed >= ambulanceArrivalMs) {
        clearInterval(interval);
        findNearbyHospital(at, forwardTo)
          .then((hospital) => {
            const to = { lng: hospital.center[0], lat: hospital.center[1] };
            const hospitalLabel = shortenPlaceLabel(hospital.place_name || "Hospital");
            setDestinationLabel(hospitalLabel);
            return getDirections(at, to, "walking").then((dirs) => {
              if (dirs?.coords?.length >= 2) {
                travellingToHospitalRef.current = true;
                setIsTravellingToHospital(true);
                startTravelWithRoute(at, to, dirs.coords, "walk", dirs.durationSeconds);
                setToast({ title: "Ambulance arrived", message: `You're being taken to ${hospitalLabel}.` });
              }
            });
          })
          .catch(() => setToast({ title: "Error", message: "Could not find a hospital nearby." }));
        setFaintPhase(null);
        if (ambulanceMarkerRef.current) {
          try {
            ambulanceMarkerRef.current.remove?.();
          } catch {}
          ambulanceMarkerRef.current = null;
        }
      }
    }, 150);

    return () => {
      clearInterval(interval);
      if (ambulanceMarkerRef.current) {
        try {
          ambulanceMarkerRef.current.remove?.();
        } catch {}
        ambulanceMarkerRef.current = null;
      }
    };
  }, [faintPhase, mapReady]);

  // Destination pin (quiz location marker). COMMENTED OUT for line-by-line debug — uncomment one block at a time to find the error.
  useEffect(() => {
    // [1] Early returns + cleanup when hunt not started
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;
    const Marker = mapboxgl.Marker;

    if (!huntHasStarted) {
      if (destinationMarkerRef.current) {
        try {
          destinationMarkerRef.current.remove?.();
        } catch {}
        destinationMarkerRef.current = null;
      }
      destinationPinColorRef.current = "yellow";
      destinationMarkerLastPosRef.current = null;
      return;
    }

    // [2] Next waypoint position: use same source as routing/arrival (huntNextLocations) so the pin always matches the destination we route to.
    const wp = activeHunt?.waypoints;
    const waypointIndex = Math.min(keys, Array.isArray(wp) ? wp.length - 1 : 0);
    const nextLocation = huntNextLocations[waypointIndex];
    const quizPinPos = nextLocation?.to ?? (Array.isArray(wp) && wp.length > 0 ? parseWaypointCoords(wp[waypointIndex] ?? wp[0]) : null);
    const quizPosValid = quizPinPos && isLngLatInNigeria(quizPinPos);

    // [3] Stop types (relaxation, bus) — for blue/yellow pin
    const isRelaxationStop =
      stopFlow &&
      (stopFlow.kind === "rejuvenate" || stopFlow.kind === "rest") &&
      stopFlow.stop;
    const isBusStopDestination =
      (isTraveling && yourCurrentModeId === "bus") ||
      travelPause?.kind === "bus_stop" ||
      prep?.modeId === "bus";

    // [4] Choose posToShow + pinColor (red=hospital, blue=relaxation, green=quiz leg walk/bike or idle quiz, yellow=bus/other travel)
    const quizWalkBikeLeg =
      Boolean(quizPosValid && quizPinPos) &&
      (yourCurrentModeId === "walk" ||
        yourCurrentModeId === "bicycle" ||
        yourCurrentModeId === "motorbike") &&
      !isBusStopDestination;

    let posToShow: { lng: number; lat: number } | null = null;
    let pinColor: "blue" | "green" | "red" | "yellow" = "yellow";

    if (isTravellingToHospital || hospitalStay) {
      const at = hospitalStay?.at ?? destination;
      if (at && isLngLatInNigeria(at)) {
        posToShow = at;
        pinColor = "red";
      }
    }
    const stopCenter = stopFlow?.stop?.center;
    if (!posToShow && isRelaxationStop && stopCenter && stopCenter.length >= 2) {
      posToShow = { lng: stopCenter[0], lat: stopCenter[1] };
      pinColor = "blue";
    }
    if (!posToShow && isBusStopDestination && destination && isLngLatInNigeria(destination)) {
      posToShow = destination;
      pinColor = "yellow";
    }
    // Active travel: route destination; green when walk/bike toward quiz waypoint (else yellow).
    if (!posToShow && isTraveling && destination && isLngLatInNigeria(destination)) {
      posToShow = destination;
      pinColor = quizWalkBikeLeg ? "green" : "yellow";
    }
    // Pending: picked point; green when walk/bike toward quiz waypoint (else yellow).
    if (!posToShow && pendingDestination && isLngLatInNigeria(pendingDestination)) {
      posToShow = pendingDestination;
      pinColor = quizWalkBikeLeg ? "green" : "yellow";
    }
    // Quiz waypoint when nothing else took the pin — idle / planning, or at venue use player position.
    if (!posToShow && quizPosValid) {
      pinColor = "green";
      if (isAtCurrentWaypoint && playerPos != null && isLngLatInNigeria(playerPos as LngLat)) {
        posToShow = playerPos as LngLat;
      } else {
        const qp = quizPinPos;
        if (qp != null && isLngLatInNigeria(qp)) posToShow = qp;
      }
    }

    // [5] Remove marker when no position to show
    if (!posToShow) {
      if (destinationMarkerRef.current) {
        try {
          destinationMarkerRef.current.remove?.();
        } catch {}
        destinationMarkerRef.current = null;
      }
      destinationPinColorRef.current = "yellow";
      destinationMarkerLastPosRef.current = null;
      return;
    }

    // [6] Add or update the marker on the map. Mapbox expects [longitude, latitude].
    // NOTE: Waypoint coordinates from DB are normalized by parseWaypointCoords() (including swapped lat/lng tolerance).
    // Do not apply additional swap heuristics here — it can flip a correct waypoint into the wrong location.
    // TRACE: Mapbox setLngLat(mapLngLat) ← posToShow ← quizPinPos ← parseWaypointCoords(activeHunt.waypoints[waypointIndex])
    const mapLngLat: [number, number] = [posToShow.lng, posToShow.lat];

    if (
      !destinationMarkerRef.current ||
      destinationPinColorRef.current !== pinColor
    ) {
      if (destinationMarkerRef.current) {
        try {
          destinationMarkerRef.current.remove?.();
        } catch {}
        destinationMarkerRef.current = null;
      }
      destinationPinColorRef.current = pinColor;
      destinationMarkerLastPosRef.current = mapLngLat;
      const pinEl = makeDestinationPinEl(pinColor);
      pinEl.setAttribute("data-marker-source", "db");
      pinEl.setAttribute("data-marker-lng", String(mapLngLat[0]));
      pinEl.setAttribute("data-marker-lat", String(mapLngLat[1]));
      pinEl.setAttribute("data-waypoint-index", String(waypointIndex));
      destinationMarkerRef.current = new Marker({
        element: pinEl,
        anchor: "bottom", // Pin tip at the exact [lng, lat]; avoids visual offset from center anchor.
      })
        .setLngLat(mapLngLat)
        .addTo(map);
    } else {
      // Only update position if it has actually changed
      const lastPos = destinationMarkerLastPosRef.current;
      const posChanged = !lastPos || lastPos[0] !== mapLngLat[0] || lastPos[1] !== mapLngLat[1];
      
      if (posChanged) {
        destinationMarkerRef.current.setLngLat(mapLngLat);
        destinationMarkerLastPosRef.current = mapLngLat;
      }
      
      const el = destinationMarkerRef.current.getElement?.();
      if (el) {
        const currentWaypointIndex = el.getAttribute("data-waypoint-index");
        // Update attributes if waypoint index changed or position changed
        if (currentWaypointIndex !== String(waypointIndex) || posChanged) {
          el.setAttribute("data-marker-source", "db");
          el.setAttribute("data-marker-lng", String(mapLngLat[0]));
          el.setAttribute("data-marker-lat", String(mapLngLat[1]));
          el.setAttribute("data-waypoint-index", String(waypointIndex));
        }
      }
    }
  }, [
    huntHasStarted,
    mapReady,
    keys,
    activeHunt?.waypoints,
    huntNextLocations,
    isTravellingToHospital,
    hospitalStay,
    destination,
    pendingDestination,
    isTraveling,
    isAtCurrentWaypoint,
    playerPos,
    travelPause?.kind,
    yourCurrentModeId,
    prep?.modeId,
    stopFlow?.kind,
    stopFlow?.stop,
  ]);

  // Camera: keep the moving avatar(s) in view. (Map boots at Nigeria zoom ~5; first real position triggers a jump — see initialHuntsCameraSnapRef.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!playerPos) return;

    // Snap once to the player as soon as we have coords (restore, GPS, IP fallback, or travel start).
    // This keeps the hunts map consistently at zoom 14 (street-level).
    if (!initialHuntsCameraSnapRef.current) {
      initialHuntsCameraSnapRef.current = true;
      const isPlane = travelModeId === "plane";
      const snapZoom = isTraveling && isPlane ? 6.8 : isTraveling ? 14 : 14;
      try {
        map.jumpTo({ center: [playerPos.lng, playerPos.lat], zoom: snapZoom });
      } catch {
        map.easeTo({ center: [playerPos.lng, playerPos.lat], zoom: snapZoom, duration: 0 });
      }
      lastCameraEaseAtRef.current = Date.now();
      return;
    }

    // While traveling, camera is driven by a RAF loop that uses route + time (same as the avatar marker).
    // Do not ease from playerPos here — it only updates every 250ms and fights smooth marker motion.
    if (isTraveling && playerPos) return;

    // Idle: gently center on you if available
    if (playerPos) {
      const now = Date.now();
      if (now - huntsRouteExplorePauseAtRef.current < ROUTE_EXPLORE_PAUSE_MS) return;
      if (now - lastCameraEaseAtRef.current < 650) return;
      lastCameraEaseAtRef.current = now;

      // Restore street zoom after plane travel (only if we're far off).
      const desiredZoom = 14;
      const currentZoom = typeof map.getZoom === "function" ? (map.getZoom() as number) : desiredZoom;
      const includeZoom = Number.isFinite(currentZoom) && Math.abs(currentZoom - desiredZoom) > 0.6;
      const center = [playerPos.lng, playerPos.lat] as [number, number];
      if (includeZoom) {
        map.easeTo({ center, zoom: desiredZoom, duration: 900 });
      } else {
        map.easeTo({ center, duration: 650 });
      }
    }
  }, [isTraveling, mapReady, playerPos, travelModeId]);

  async function geocode(q: string, signal?: AbortSignal) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const qLower = q.toLowerCase();
      const isAirportQuery = qLower.includes("airport");
      const url = isAirportQuery
        ? `/api/airports/search?q=${encodeURIComponent(q)}`
        : `/api/mapbox/geocode?q=${encodeURIComponent(q)}`;

      const res = await fetch(url, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Geocode failed");
      const features = Array.isArray(json.features) ? json.features : [];
      setSearchResults(
        features
          .filter((f: any) => Array.isArray(f.center) && f.center.length === 2)
          .map((f: any) => ({
            id: String(f.id),
            place_name: String(f.place_name),
            center: [Number(f.center[0]), Number(f.center[1])] as [number, number],
          })),
      );
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setSearchResults([]);
      setSearchError(e?.message || "Geocode failed");
    } finally {
      setSearchLoading(false);
    }
  }

  // Autocomplete while typing (debounced)
  useEffect(() => {
    const q = searchQuery.trim();
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }

    if (q.length < 3) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    searchDebounceRef.current = window.setTimeout(() => {
      void geocode(q, ctrl.signal);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  async function clueGeocode(q: string, signal?: AbortSignal) {
    setClueLoading(true);
    setClueError(null);
    try {
      const qLower = q.toLowerCase();
      const isAirportQuery = qLower.includes("airport");
      const url = isAirportQuery
        ? `/api/airports/search?q=${encodeURIComponent(q)}`
        : `/api/mapbox/geocode?q=${encodeURIComponent(q)}`;

      const res = await fetch(url, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Search failed");
      const features = Array.isArray(json.features) ? json.features : [];
      setClueResults(
        features
          .filter((f: any) => Array.isArray(f.center) && f.center.length === 2)
          .map((f: any) => ({
            id: String(f.id),
            place_name: String(f.place_name),
            center: [Number(f.center[0]), Number(f.center[1])] as [number, number],
          })),
      );
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setClueResults([]);
      setClueError(e?.message || "Search failed");
    } finally {
      setClueLoading(false);
    }
  }

  // Clue answer autocomplete (debounced)
  useEffect(() => {
    const q = clueQuery.trim();
    if (clueDebounceRef.current) {
      window.clearTimeout(clueDebounceRef.current);
      clueDebounceRef.current = null;
    }
    if (clueAbortRef.current) {
      clueAbortRef.current.abort();
      clueAbortRef.current = null;
    }

    if (q.length < 3) {
      setClueResults([]);
      setClueError(null);
      setClueLoading(false);
      return;
    }

    const ctrl = new AbortController();
    clueAbortRef.current = ctrl;
    clueDebounceRef.current = window.setTimeout(() => {
      void clueGeocode(q, ctrl.signal);
    }, 300);

    return () => {
      if (clueDebounceRef.current) {
        window.clearTimeout(clueDebounceRef.current);
        clueDebounceRef.current = null;
      }
      if (clueAbortRef.current) {
        clueAbortRef.current.abort();
        clueAbortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clueQuery]);

  function rpsResult(you: RpsMove, bot: RpsMove): "win" | "lose" | "draw" {
    if (you === bot) return "draw";
    if (you === "rock" && bot === "scissors") return "win";
    if (you === "scissors" && bot === "paper") return "win";
    if (you === "paper" && bot === "rock") return "win";
    return "lose";
  }

  function playRps(you: RpsMove) {
    const botMoves: RpsMove[] = ["rock", "paper", "scissors"];
    const bot = botMoves[Math.floor(Math.random() * botMoves.length)]!;
    const res = rpsResult(you, bot);
    setRps((prev) => {
      const cur = prev ?? { your: 0, bot: 0, done: false };
      if (cur.done) return cur;
      const nextYour = cur.your + (res === "win" ? 1 : 0);
      const nextBot = cur.bot + (res === "lose" ? 1 : 0);
      const done = nextYour >= 2 || nextBot >= 2;
      return { your: nextYour, bot: nextBot, done, last: { you, bot, result: res } };
    });
  }

  async function getDirections(
    from: LngLat,
    to: LngLat,
    profile: "walking" | "cycling" | "driving",
  ) {
    const fetchDirections = async (p: "walking" | "cycling" | "driving") => {
      const url = new URL("/api/mapbox/directions", window.location.origin);
      url.searchParams.set("fromLng", String(from.lng));
      url.searchParams.set("fromLat", String(from.lat));
      url.searchParams.set("toLng", String(to.lng));
      url.searchParams.set("toLat", String(to.lat));
      url.searchParams.set("profile", p);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Directions failed");
      const coords = Array.isArray(json.coordinates)
        ? (json.coordinates as Array<[number, number]>)
        : [];
      const durationSeconds = Number(json.durationSeconds);
      const distanceMeters = Number(json.distanceMeters);
      return {
        coords,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : NaN,
        distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : NaN,
      };
    };

    // Water-crossing safety:
    // If walking directions fail or return unusable geometry (common near lagoons/creeks),
    // retry with driving (still `exclude=ferry` in the API route) so Mapbox routes via bridges/roads.
    try {
      const out = await fetchDirections(profile);
      const ok =
        Array.isArray(out.coords) &&
        out.coords.length >= 2 &&
        out.coords.every(
          (pt) =>
            Array.isArray(pt) &&
            pt.length >= 2 &&
            Number.isFinite(pt[0]) &&
            Number.isFinite(pt[1])
        );
      if (profile === "walking" && !ok) {
        return await fetchDirections("driving");
      }
      return out;
    } catch (e) {
      if (profile === "walking") {
        return await fetchDirections("driving");
      }
      throw e;
    }
  }

  /** Driving + live traffic + alternate routes (Mapbox). Falls back to caller on failure. */
  async function getDrivingDirectionsWithTraffic(from: LngLat, to: LngLat) {
    const url = new URL("/api/mapbox/directions", window.location.origin);
    url.searchParams.set("fromLng", String(from.lng));
    url.searchParams.set("fromLat", String(from.lat));
    url.searchParams.set("toLng", String(to.lng));
    url.searchParams.set("toLat", String(to.lat));
    url.searchParams.set("profile", "driving");
    url.searchParams.set("traffic", "1");
    url.searchParams.set("alternatives", "1");
    const res = await fetch(url.toString());
    const json = (await res.json()) as {
      error?: string;
      coordinates?: unknown;
      durationSeconds?: unknown;
      distanceMeters?: unknown;
      durationTypicalSeconds?: unknown;
      trafficDelaySeconds?: unknown;
      alternateRoutes?: Array<{
        coordinates?: unknown;
        durationSeconds?: unknown;
        distanceMeters?: unknown;
      }>;
    };
    if (!res.ok) throw new Error(json?.error || "Directions failed");
    const coords = Array.isArray(json.coordinates)
      ? (json.coordinates as Array<[number, number]>)
      : [];
    const durationSeconds = Number(json.durationSeconds);
    const distanceMeters = Number(json.distanceMeters);
    const durationTypicalSeconds =
      json.durationTypicalSeconds != null && Number.isFinite(Number(json.durationTypicalSeconds))
        ? Number(json.durationTypicalSeconds)
        : null;
    const trafficDelaySeconds =
      json.trafficDelaySeconds != null && Number.isFinite(Number(json.trafficDelaySeconds))
        ? Number(json.trafficDelaySeconds)
        : null;

    let alternate:
      | { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number }
      | undefined;
    const primaryDur = Number.isFinite(durationSeconds) ? durationSeconds : NaN;
    if (Array.isArray(json.alternateRoutes) && Number.isFinite(primaryDur)) {
      let bestDur = Infinity;
      let best: { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number } | null =
        null;
      for (const ar of json.alternateRoutes) {
        const ac = ar?.coordinates;
        if (!Array.isArray(ac) || ac.length < 2) continue;
        const d = Number(ar.durationSeconds);
        if (!Number.isFinite(d)) continue;
        const savesEnough = d <= primaryDur - 45 || d <= primaryDur * 0.92;
        if (!savesEnough) continue;
        if (d < bestDur) {
          bestDur = d;
          const dm = Number(ar.distanceMeters);
          best = {
            coords: ac as Array<[number, number]>,
            durationSeconds: d,
            distanceMeters: Number.isFinite(dm) ? dm : NaN,
          };
        }
      }
      if (best) alternate = best;
    }

    return {
      coords,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : NaN,
      distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : NaN,
      durationTypicalSeconds,
      trafficDelaySeconds,
      alternate,
    };
  }

  async function findNearbyStop(kind: "rejuvenate" | "refuel" | "rest", from: LngLat) {
    const url = new URL("/api/osm/nearby", window.location.origin);
    url.searchParams.set("kind", kind === "rejuvenate" ? "rejuvenate" : kind === "refuel" ? "fuel" : "rest");
    url.searchParams.set("lng", String(from.lng));
    url.searchParams.set("lat", String(from.lat));
    
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (e: any) {
      // Return friendly error message based on kind
      if (kind === "refuel") {
        throw new Error("No filling station around, refuel on next stop");
      } else if (kind === "rest") {
        throw new Error("No relaxation around, relax in next stop");
      } else {
        throw new Error("No rejuvenation spot around, continue to next stop");
      }
    }
    
    // Check if response has content before parsing JSON
    const contentType = res.headers.get("content-type");
    const text = await res.text();
    
    if (!text || text.trim().length === 0) {
      // Return friendly error message based on kind
      if (kind === "refuel") {
        throw new Error("No filling station around, refuel on next stop");
      } else if (kind === "rest") {
        throw new Error("No relaxation around, relax in next stop");
      } else {
        throw new Error("No rejuvenation spot around, continue to next stop");
      }
    }
    
    let json: any;
    try {
      json = JSON.parse(text);
    } catch (e: any) {
      // Return friendly error message based on kind
      if (kind === "refuel") {
        throw new Error("No filling station around, refuel on next stop");
      } else if (kind === "rest") {
        throw new Error("No relaxation around, relax in next stop");
      } else {
        throw new Error("No rejuvenation spot around, continue to next stop");
      }
    }
    
    if (!res.ok) {
      // Return friendly error message based on kind
      if (kind === "refuel") {
        throw new Error("No filling station around, refuel on next stop");
      } else if (kind === "rest") {
        throw new Error("No relaxation around, relax in next stop");
      } else {
        throw new Error("No rejuvenation spot around, continue to next stop");
      }
    }
    
    if (!json?.center || !Array.isArray(json.center) || json.center.length !== 2) {
      // Return friendly error message based on kind
      if (kind === "refuel") {
        throw new Error("No filling station around, refuel on next stop");
      } else if (kind === "rest") {
        throw new Error("No relaxation around, relax in next stop");
      } else {
        throw new Error("No rejuvenation spot around, continue to next stop");
      }
    }
    
    return {
      place_name: String(json.place_name || "Stop"),
      center: [Number(json.center[0]), Number(json.center[1])] as [number, number],
    };
  }

  /** If forwardTo is set, search from a point ahead so we pick a hospital in front of the user, not behind. */
  async function findNearbyHospital(
    from: LngLat,
    forwardTo?: LngLat,
  ): Promise<{ place_name: string; center: [number, number] }> {
    const searchFrom = forwardTo
      ? (() => {
          const d = haversineKm(from, forwardTo);
          if (d < 0.01) return from;
          const t = Math.min(1, 2 / d);
          return {
            lng: from.lng + (forwardTo.lng - from.lng) * t,
            lat: from.lat + (forwardTo.lat - from.lat) * t,
          };
        })()
      : from;
    const url = new URL("/api/osm/nearby", window.location.origin);
    url.searchParams.set("kind", "hospital");
    url.searchParams.set("lng", String(searchFrom.lng));
    url.searchParams.set("lat", String(searchFrom.lat));
    const res = await fetch(url.toString());
    const text = await res.text();
    if (!res.ok || !text?.trim()) throw new Error("No hospital found nearby");
    const json = JSON.parse(text) as { place_name?: string; center?: number[] };
    if (!json?.center || !Array.isArray(json.center) || json.center.length < 2) throw new Error("No hospital found nearby");
    return {
      place_name: String(json.place_name || "Hospital"),
      center: [Number(json.center[0]), Number(json.center[1])] as [number, number],
    };
  }

  function profileForMode(modeId: TravelModeId): "walking" | "cycling" | "driving" {
    // Keep consistent with our routing usage elsewhere.
    if (modeId === "walk") return "walking";
    // Bicycle uses road distance for consistent comparisons in our demo.
    if (modeId === "bicycle") return "driving";
    return "driving";
  }

  async function startTravelWithRoute(
    from: LngLat,
    to: LngLat,
    coords: Array<[number, number]>,
    modeId: TravelModeId,
    etaSeconds?: number,
    finalDestination?: LngLat,
    rejuvenateBonusKm?: number,
  ) {
    if (!coords || coords.length < 2) return;
    // Snap route to road network so broadcast and stored route stay on the map road (fixes off-road offset on different screen sizes).
    // Skip map-matching for walking: downsampling + match can produce routes that cut across water. Directions API walking geometry follows pedestrian paths.
    let coordsToUse = coords;
    if (modeId !== "walk") {
      try {
        const profile = profileForMode(modeId);
        const res = await fetch("/api/mapbox/map-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates: coords, profile }),
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.coordinates) && json.coordinates.length >= 2) {
            coordsToUse = json.coordinates as Array<[number, number]>;
          }
        }
      } catch {
        // Keep directions geometry if map-match fails
      }
    }
    setDestination(to);
    setRouteCoords(coordsToUse);
    setProgress(0);

    const cumKm: number[] = [0];
    let totalKm = 0;
    for (let i = 1; i < coordsToUse.length; i++) {
      const a = coordsToUse[i - 1];
      const b = coordsToUse[i];
      totalKm += haversineKm({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
      cumKm.push(totalKm);
    }
    // Walk / bicycle: ensure route ends at destination (map-match can drift the last point)
    if ((modeId === "walk" || modeId === "bicycle") && coordsToUse.length >= 1) {
      const lastCoord = coordsToUse[coordsToUse.length - 1];
      const distToEndKm = haversineKm({ lng: lastCoord[0], lat: lastCoord[1] }, to);
      if (distToEndKm > ARRIVAL_RADIUS_KM) {
        coordsToUse = [...coordsToUse, [to.lng, to.lat]];
        const segKm = haversineKm({ lng: lastCoord[0], lat: lastCoord[1] }, to);
        totalKm += segKm;
        cumKm.push(totalKm);
        setRouteCoords(coordsToUse);
      }
    }
    const now = Date.now();
    // Walk uses 5 km/h; bicycle uses its own speed (slightly better than walk); other modes use DEMO_TRAVEL_SPEED_KMH.
    const speedKmh = modeId === "walk" ? 5 : (TRAVEL_MODES.find((m) => m.id === modeId)?.speedKmh ?? DEMO_TRAVEL_SPEED_KMH);
    const baseSpeedup = modeId === "walk" ? SIM_SPEEDUP * WALK_ANIMATION_SPEEDUP : SIM_SPEEDUP;
    const speedKmPerMs = speedKmh / (60 * 60 * 1000);
    // Walk: derive duration from actual route length (totalKm) so HUD % and avatar position stay in sync.
    // Map-match can change route geometry; etaSeconds is from the pre-map-match route and can mismatch.
    const rawMsFromTotalKm = totalKm / speedKmPerMs;
    let gameDurationMs: number;
    let durationMs: number;
    if (modeId === "walk") {
      durationMs = Math.max(2500, Math.round(rawMsFromTotalKm / baseSpeedup));
      durationMs = Math.max(MIN_WALK_ANIMATION_MS, Math.min(durationMs, MAX_WALK_ANIMATION_MS));
      gameDurationMs = durationMs; // Same as animation so HUD and avatar always match
    } else if (modeId === "bicycle") {
      // Derive duration from matched path length (like walk). Pre-route eta can disagree with map-matched totalKm and makes speed non-uniform toward the stop.
      durationMs = Math.max(2500, Math.round(rawMsFromTotalKm / baseSpeedup));
      gameDurationMs = durationMs;
    } else {
      gameDurationMs = Number.isFinite(etaSeconds) && etaSeconds! > 0
      ? Math.max(2500, Math.round((etaSeconds! * 1000) / SIM_SPEEDUP))
        : Math.max(5000, Math.round(rawMsFromTotalKm / SIM_SPEEDUP));
      durationMs = Number.isFinite(etaSeconds) && etaSeconds! > 0
        ? Math.max(2500, Math.round((etaSeconds! * 1000) / baseSpeedup))
        : Math.max(5000, Math.round(rawMsFromTotalKm / baseSpeedup));
    }
    const baseRejuvenateKm =
      modeId === "walk"
        ? WALK_REJUVENATE_EVERY_KM
        : modeId === "bicycle"
          ? BIKE_REJUVENATE_EVERY_KM
          : 0;
    travelRef.current = {
      modeId,
      coords: coordsToUse,
      cumKm,
      totalKm,
      to,
      finalDestination,
      nextRejuvenateAtKm:
        modeId === "walk" || modeId === "bicycle"
          ? baseRejuvenateKm + (rejuvenateBonusKm ?? 0)
          : undefined,
      nextRefuelAtKm:
        modeId === "motorbike"
          ? MOTO_REFUEL_EVERY_KM
          : modeId === "car"
            ? CAR_REFUEL_EVERY_KM
            : undefined,
      nextRestAtKm: modeId === "motorbike" || modeId === "car" ? DRIVE_REST_EVERY_KM : undefined,
      nextBusStopAtKm: modeId === "bus" ? BUS_STOP_EVERY_KM : undefined,
      startedAt: now,
      durationMs,
      lastTickAt: now,
    };
    // Lock avatar + camera to route start before isTraveling flips (avoids null playerPos while DB restore is skipped).
    {
      const p0 = coordsToUse[0]!;
      setPlayerPos({ lng: p0[0], lat: p0[1] });
    }
    warnedLowFuelRef.current = false;
    pauseRef.current = null;
    setTravelPause(null);
    // Set ref immediately so realtime (from our own start upsert) and slow restore fetch don't overwrite position
    isTravelingRef.current = true;
    if (travelStartedAtRef) travelStartedAtRef.current = Date.now();
    setIsTraveling(true);

    // Log avatar start to terminal for comparison with broadcast (every time you click Go).
    const routeStart = { lng: coordsToUse[0]![0], lat: coordsToUse[0]![1] };
    const huntsPayload = {
      source: "hunts",
      huntId: activeHuntId ?? null,
      playerId: user?.id ?? null,
      routeStart: { lng: routeStart.lng, lat: routeStart.lat },
      routeLength: coordsToUse.length,
    };
    fetch("/api/debug-log-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(huntsPayload),
    }).catch(() => {});

    // Broadcast: persist route so broadcast can animate.
    // IMPORTANT: set the local payload unconditionally so periodic DB saves don't clear travel_started_at/duration
    // if Supabase isn't ready for a moment (prevents broadcast seeing a "planned route" during active travel).
    const coordsForStorage = serializeRouteCoords(coordsToUse);
    const startedAtIso = new Date().toISOString();
    travelBroadcastPayloadRef.current = {
      startedAt: startedAtIso,
      routeCoords: coordsForStorage,
      durationMs,
    };

    // Use 6-decimal precision (~0.1m) so DB/realtime serialization doesn't introduce drift across screen sizes.
    if (activeHuntId && user?.id && supabase) {
      const playerName = (profile?.username as string) || "Player";
      emitHuntPlayerAction("travel_started", {
        modeId,
        startedAt: startedAtIso,
        durationMs,
        routeCoords: coordsForStorage,
        from: { lng: Number(from.lng.toFixed(6)), lat: Number(from.lat.toFixed(6)) },
        to: { lng: Number(to.lng.toFixed(6)), lat: Number(to.lat.toFixed(6)) },
        ...(finalDestination
          ? {
              finalDestination: {
                lng: Number(finalDestination.lng.toFixed(6)),
                lat: Number(finalDestination.lat.toFixed(6)),
              },
            }
          : {}),
      });
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
      supabase
        .from("player_positions")
        .upsert(
          {
            hunt_id: activeHuntId,
            player_id: user.id,
            player_name: playerName,
            // Canonical start: routeCoords[0], so broadcast + hunts are pixel-aligned.
            lng: routeStart.lng,
            lat: routeStart.lat,
            keys,
            travel_mode: modeId,
            travel_started_at: startedAtIso,
            travel_route_coords: coordsForStorage,
            travel_duration_ms: durationMs,
            active_client_id: getClientId(),
            last_active_at: new Date().toISOString(),
            ...getHuntsMapCameraDbFields(),
          },
          { onConflict: "hunt_id,player_id" }
        )
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn("[Hunts] broadcast travel start upsert error", error);
        });
    }
  }

  function fmtEta(etaSeconds: number | null) {
    if (etaSeconds == null || !Number.isFinite(etaSeconds)) return "—";
    const mins = Math.max(1, Math.round(etaSeconds / 60));
    return `${mins} min`;
  }

  function handlePlaneChooseTransfer(departureAirportTo: LngLat, arrivalAirportTo: LngLat) {
    if (!planeFlow) return;
    // When user arrives at departure airport: start 10 min boarding (don't fly yet).
    arrivalActionRef.current = () => {
      const current = playerPos;
      if (!current) return;
      const fare = planeFlow.fareCoins || 0;
      (fare > 0 ? deductCredits(fare) : Promise.resolve(credits)).then((newBal) => {
        if (fare > 0 && newBal === null) return;
        boardingFlightStartRef.current = {
          playerPos: current,
          arrivalAirportTo,
          finalTo: planeFlow.finalTo,
          finalLabel: planeFlow.finalLabel,
        };
        setTravelModeId("plane");
        setPlaneFlow((p) =>
          p
            ? {
                ...p,
                stage: "boarding",
                boardingStartedAt: Date.now(),
              }
            : p,
        );
        setToast({
          title: "Boarding",
          message: `Boarding in progress. Your flight will depart in ${PLANE_BOARDING_MINUTES} minutes.`,
        });
      });
      arrivalActionRef.current = null;
    };
    setPendingDestination(departureAirportTo);
    setPendingDestinationLabel(planeFlow.departureAirport?.place_name ?? "");
    setDrawer("travel");
  }

  // Next checkpoint to suggest when travel drawer is open = the waypoint the user needs to reach for the next key (index keys), not the one after.
  // Do not show while at a quiz (arrivedForChallenge); they must pass first.
  const nextCheckpointForTravel =
    huntPhase === "public_trip"
      ? null
      : huntPhase === "public_task"
        ? null
        : huntPhase === "hunt" && !arrivedForChallenge && keys < keysToWin
          ? (huntNextLocations[keys] ?? null)
          : null;

  // Destination to use for ETA/offers: pending, current trip destination when traveling, public checkpoint, or suggested next when travel drawer is open.
  const destForDirs =
    pendingDestination ||
    (isTraveling && destination ? destination : null) ||
    (drawer === "travel" && huntPhase === "public_trip" && publicLocation ? publicLocation : null) ||
    (drawer === "travel" && nextCheckpointForTravel ? nextCheckpointForTravel.to : null);

  baseDirsPosRef.current = playerPos;
  baseDirsDestRef.current = destForDirs;

  /** Stable key so effect only re-runs when rounded pos or dest changes, not on every playerPos object reference (GPS jitter). */
  const baseDirsStableKey = useMemo(() => {
    if (drawer !== "travel" || isTraveling || !destForDirs || !playerPos) return null;
    const posKey = `${Math.round(playerPos.lng * 500) / 500},${Math.round(playerPos.lat * 500) / 500}`;
    const destKey = `${destForDirs.lng},${destForDirs.lat}`;
    return `${posKey}|${destKey}`;
  }, [drawer, isTraveling, destForDirs?.lng, destForDirs?.lat, playerPos?.lng, playerPos?.lat]);

  useEffect(() => {
    setDrivingRouteChoice("primary");
  }, [baseDirsStableKey]);

  // Build base durations/coords to show per-mode ETA choices (3 requests total).
  // Only when travel drawer is open; skip when traveling; throttle by position/dest so we don't burn Mapbox on every GPS tick.
  // When effect bails or re-runs (e.g. same key), clear loading so we never leave "Calculating…" stuck. Deps use baseDirsStableKey so we don't cancel in-flight request on every GPS tick.
  useEffect(() => {
    if (drawer !== "travel") {
      lastBaseDirsKeyRef.current = null;
      setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    if (baseDirsStableKey == null) {
      setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    const key = baseDirsStableKey;
    if (lastBaseDirsKeyRef.current === key) {
      setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    lastBaseDirsKeyRef.current = key;
    const from = baseDirsPosRef.current;
    const to = baseDirsDestRef.current;
    if (!from || !to) {
      setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setBaseDirs((s) => ({ ...s, loading: true, error: null, networkError: false }));
        const [w, c, d] = await Promise.allSettled([
          getDirections(from, to, "walking"),
          getDirections(from, to, "cycling"),
          (async () => {
            try {
              return await getDrivingDirectionsWithTraffic(from, to);
            } catch {
              return getDirections(from, to, "driving");
            }
          })(),
        ]);
        if (cancelled) {
          setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
          return;
        }
        const next: any = { loading: false, error: null, networkError: false };
        
        // Check for network errors (TypeError, fetch failures)
        const hasNetworkError = [w, c, d].some(
          (r) => r.status === "rejected" && 
          (r.reason instanceof TypeError || 
           r.reason?.message?.includes("fetch") ||
           r.reason?.message?.includes("network") ||
           r.reason?.message?.includes("Failed to fetch"))
        );
        
        if (w.status === "fulfilled" && w.value.coords.length >= 2) {
          next.walking = {
            coords: w.value.coords,
            durationSeconds: w.value.durationSeconds,
            distanceMeters: w.value.distanceMeters,
          };
        }
        if (c.status === "fulfilled" && c.value.coords.length >= 2) {
          next.cycling = {
            coords: c.value.coords,
            durationSeconds: c.value.durationSeconds,
            distanceMeters: c.value.distanceMeters,
          };
        }
        if (d.status === "fulfilled" && d.value.coords.length >= 2) {
          const dv = d.value as {
            coords: Array<[number, number]>;
            durationSeconds: number;
            distanceMeters: number;
            durationTypicalSeconds?: number | null;
            trafficDelaySeconds?: number | null;
            alternate?: {
              coords: Array<[number, number]>;
              durationSeconds: number;
              distanceMeters: number;
            };
          };
          next.driving = {
            coords: dv.coords,
            durationSeconds: dv.durationSeconds,
            distanceMeters: dv.distanceMeters,
            ...(dv.durationTypicalSeconds != null ? { durationTypicalSeconds: dv.durationTypicalSeconds } : {}),
            ...(dv.trafficDelaySeconds != null ? { trafficDelaySeconds: dv.trafficDelaySeconds } : {}),
            ...(dv.alternate ? { alternate: dv.alternate } : {}),
          };
        }
        if (!next.walking && !next.cycling && !next.driving) {
          if (hasNetworkError) {
            next.error = "Unable to calculate route. Please check your internet connection and try again.";
            next.networkError = true;
          } else {
            // Check if it's a Mapbox API error
            const hasApiError = [w, c, d].some(
              (r) => r.status === "rejected" && 
              (r.reason?.message?.includes("Mapbox") || 
               r.reason?.message?.includes("502") ||
               r.reason?.message?.includes("503") ||
               r.reason?.message?.includes("504"))
            );
            if (hasApiError) {
              next.error = "Route service temporarily unavailable. Please try again in a moment.";
              next.networkError = true;
            } else {
              next.error = "No route found to that destination. The routing service couldn't find a path between these locations.";
            }
          }
        }
        setBaseDirs(next);
      } catch (e: any) {
        if (cancelled) {
          setBaseDirs((s) => (s.loading ? { ...s, loading: false } : s));
          return;
        }
        const isNetworkError = e instanceof TypeError || 
          e?.message?.includes("fetch") ||
          e?.message?.includes("network") ||
          e?.message?.includes("Failed to fetch");
        setBaseDirs({ 
          loading: false, 
          error: isNetworkError 
            ? "Network error. Please check your internet connection and try again."
            : e?.message || "Failed to load ETAs.",
          networkError: isNetworkError
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawer, baseDirsStableKey, isTraveling]);

  // Write planned route to DB so broadcast can preview it before travel starts.
  const lastPlannedRouteSavedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isTraveling || !activeHuntId || !user?.id || !supabase) return;
    const walkCoords = baseDirs.walking?.coords;
    const driveCoords = baseDirs.driving?.coords;
    const coords = walkCoords ?? driveCoords;
    if (!coords || coords.length < 2) return;
    const saveKey = `${coords[0][0]},${coords[0][1]}|${coords[coords.length - 1][0]},${coords[coords.length - 1][1]}`;
    if (lastPlannedRouteSavedKeyRef.current === saveKey) return;
    lastPlannedRouteSavedKeyRef.current = saveKey;
    const serialized = serializeRouteCoords(coords);
    refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
    supabase
      .from("player_positions")
      .upsert(
        {
          hunt_id: activeHuntId,
          player_id: user.id,
          travel_route_coords: serialized,
          last_active_at: new Date().toISOString(),
          ...getHuntsMapCameraDbFields(),
        } as any,
        { onConflict: "hunt_id,player_id" }
      )
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn("[Hunts] planned route upsert error", error);
      });
  }, [baseDirs.walking?.coords, baseDirs.driving?.coords, isTraveling, activeHuntId, user?.id, supabase]);

  // When plane drawer opens, resolve airports:
  // - departure airport in your current state
  // - arrival airport in the destination state
  useEffect(() => {
    if (drawer !== "plane") return;
    if (!planeFlow) return;
    if (planeFlow.departureAirport) return;
    if (planeFlow.loadingDeparture) return;

    let cancelled = false;
    setPlaneFlow((p) => (p ? { ...p, loadingDeparture: true, error: null } : p));
    void (async () => {
      try {
        const airport = await findNearestAirport(planeFlow.from);
        if (cancelled) return;
        setPlaneFlow((p) =>
          p ? { ...p, departureAirport: airport, loadingDeparture: false, error: null } : p,
        );
      } catch (e: any) {
        if (cancelled) return;
        setPlaneFlow((p) => {
          if (!p) return p;
          const errorMsg = e?.message || "No airport found nearby";
          // Mark this as a departure airport error
          const departureError = errorMsg.includes("departure") 
            ? errorMsg 
            : `Departure airport: ${errorMsg}`;
          return { 
            ...p, 
            loadingDeparture: false, 
            error: departureError,
            departureAirport: undefined // Ensure it's cleared
          };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // IMPORTANT: don't depend on planeFlow.loading here. We set loading=true inside this effect,
    // and React will run the cleanup before re-running the effect when deps change. That would
    // flip `cancelled=true` and prevent us from ever setting the result (stuck "Finding...").
  }, [drawer, planeFlow?.departureAirport, planeFlow?.from, planeFlow?.lookupNonce]);

  useEffect(() => {
    if (drawer !== "plane") return;
    if (!planeFlow) return;
    if (planeFlow.arrivalAirport) return;
    if (planeFlow.loadingArrival) return;

    let cancelled = false;
    setPlaneFlow((p) => (p ? { ...p, loadingArrival: true, error: null } : p));
    void (async () => {
      try {
        const airport = await findNearestAirport(planeFlow.finalTo);
        if (cancelled) return;
        setPlaneFlow((p) =>
          p ? { ...p, arrivalAirport: airport, loadingArrival: false, error: null } : p,
        );
      } catch (e: any) {
        if (cancelled) return;
        setPlaneFlow((p) => {
          if (!p) return p;
          const errorMsg = e?.message || "No airport found nearby";
          // Mark this as an arrival airport error
          const arrivalError = errorMsg.includes("arrival") || errorMsg.includes("destination") 
            ? errorMsg 
            : `Arrival airport: ${errorMsg}`;
          return { 
            ...p, 
            loadingArrival: false, 
            error: arrivalError,
            arrivalAirport: undefined // Ensure it's cleared
          };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawer, planeFlow?.arrivalAirport, planeFlow?.finalTo, planeFlow?.lookupNonce]);

  // When boarding time (10 min) elapses, start the flight.
  useEffect(() => {
    if (planeFlow?.stage !== "boarding" || !planeFlow.boardingStartedAt) return;
    const durationMs = PLANE_BOARDING_MINUTES * 60 * 1000;
    const t = window.setTimeout(() => {
      const d = boardingFlightStartRef.current;
      if (!d) return;
      const eta = flightEtaSeconds(d.playerPos, d.arrivalAirportTo);
      setPlaneFlow((p) => (p ? { ...p, stage: "flying" } : p));
      arrivalActionRef.current = () => {
        setPlaneFlow(null);
        setTravelModeId("walk");
        setPendingDestination(d.finalTo);
        setPendingDestinationLabel(d.finalLabel);
        setDrawer("travel");
      };
      startTravelWithRoute(
        d.playerPos,
        d.arrivalAirportTo,
        [
          [d.playerPos.lng, d.playerPos.lat],
          [d.arrivalAirportTo.lng, d.arrivalAirportTo.lat],
        ],
        "plane",
        eta,
      );
      boardingFlightStartRef.current = null;
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [planeFlow?.stage, planeFlow?.boardingStartedAt]);

  // When disembarking time (5 min) elapses, run arrival action and clear plane flow.
  useEffect(() => {
    if (planeFlow?.stage !== "disembarking" || !planeFlow.disembarkingEndsAt) return;
    const delayMs = Math.max(0, planeFlow.disembarkingEndsAt - Date.now());
    const t = window.setTimeout(() => {
      arrivalActionRef.current?.();
      arrivalActionRef.current = null;
      setPlaneFlow(null);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [planeFlow?.stage, planeFlow?.disembarkingEndsAt]);

  async function startTravel() {
    if (!playerPos || !destination || routeCoords.length < 2) return;
    await startTravelWithRoute(playerPos, destination, routeCoords, travelModeId);
  }

  // Animate along polyline while traveling (you)
  useEffect(() => {
    if (!isTraveling) return;
    const t = window.setInterval(() => {
      // You
      if (isTraveling) {
        // If paused for a bus stop, don't advance along the route.
        if (travelPause) {
          const elapsed = Date.now() - travelPause.startedAt;
          if (elapsed >= travelPause.totalMs) {
            // auto-resume
            const pauseMeta = pauseRef.current;
            const tr = travelRef.current;
            if (pauseMeta && tr) {
              const pauseDuration = Date.now() - pauseMeta.startedAt;
              tr.startedAt += pauseDuration;
              tr.lastTickAt = Date.now();
                emitHuntPlayerAction("travel_resumed", {
                  modeId: tr.modeId,
                  startedAt: new Date(tr.startedAt).toISOString(),
                  durationMs: tr.durationMs,
                  routeCoords: serializeRouteCoords(tr.coords),
                  resumedAt: new Date().toISOString(),
                });
            }
            pauseRef.current = null;
            setTravelPause(null);
            if (busPauseOpenedRef.current) {
              busPauseOpenedRef.current = false;
              setDrawer(null);
            }
          }
          return;
        }

        const tr = travelRef.current;
        if (tr) {
          const now = Date.now();
          const durationMs = Math.max(1, tr.durationMs);
          const gameDurationMs = Math.max(1, (tr as { gameDurationMs?: number }).gameDurationMs ?? tr.durationMs);
          const pAnim = clamp((now - tr.startedAt) / durationMs, 0, 1);
          const pGame = clamp((now - tr.startedAt) / gameDurationMs, 0, 1);
          const targetKm = tr.totalKm * pAnim;
          let i = 1;
          while (i < tr.cumKm.length && tr.cumKm[i] < targetKm) i++;
          i = clamp(i, 1, tr.cumKm.length - 1);
          const prevKm = tr.cumKm[i - 1];
          const segKm = tr.cumKm[i] - prevKm || 1e-9;
          const localT = clamp((targetKm - prevKm) / segKm, 0, 1);
          const a = tr.coords[i - 1];
          const b = tr.coords[i];
          let nextPos: LngLat = {
            lng: a[0] + (b[0] - a[0]) * localT,
            lat: a[1] + (b[1] - a[1]) * localT,
          };
          if (pAnim >= 1) {
            const last = tr.coords[tr.coords.length - 1];
            nextPos = last ? { lng: last[0], lat: last[1] } : tr.to;
          }
          setPlayerPos(nextPos);

          const distToDestKm = haversineKm(nextPos, tr.to);
          if (tr.modeId === "walk") {
            setProgress(distToDestKm <= ARRIVAL_RADIUS_KM ? 1 : pAnim);
          } else {
            setProgress(pGame);
          }

          const travelledKm = tr.modeId === "walk" ? tr.totalKm * pAnim : tr.totalKm * pGame;

          // Build narrator state for broadcast dashboard
          {
            const mode = TRAVEL_MODES.find((m) => m.id === tr.modeId);
            const speedKmh = mode?.speedKmh ?? 5;
            const remainingKm = Math.max(0, tr.totalKm - travelledKm);

            let fuelPctNarr: number | null = null;
            if ((tr.modeId === "motorbike" || tr.modeId === "car") && tr.nextRefuelAtKm) {
              const refuelInterval = tr.modeId === "car" ? CAR_REFUEL_EVERY_KM : MOTO_REFUEL_EVERY_KM;
              const fuelRemainingKm = Math.max(0, tr.nextRefuelAtKm - travelledKm);
              fuelPctNarr = refuelInterval > 0 ? Math.round((100 * fuelRemainingKm) / refuelInterval) : 100;
            }

            let vehicleHealthPct: number | null = null;
            if (tr.modeId === "bicycle" || tr.modeId === "motorbike" || tr.modeId === "car") {
              const v = vehicleStateRef.current[tr.modeId as VehicleId];
              if (v?.status === "ok") vehicleHealthPct = Math.round(v.healthPct);
            }

            let nextThresholdKm: number | null = null;
            let nextThresholdKind: string | null = null;
            if (tr.nextRejuvenateAtKm && tr.nextRejuvenateAtKm > travelledKm) {
              nextThresholdKm = Math.round((tr.nextRejuvenateAtKm - travelledKm) * 100) / 100;
              nextThresholdKind = "rejuvenate";
            }
            if (tr.nextRefuelAtKm && tr.nextRefuelAtKm > travelledKm) {
              const d = Math.round((tr.nextRefuelAtKm - travelledKm) * 100) / 100;
              if (!nextThresholdKm || d < nextThresholdKm) { nextThresholdKm = d; nextThresholdKind = "refuel"; }
            }
            if (tr.nextRestAtKm && tr.nextRestAtKm > travelledKm) {
              const d = Math.round((tr.nextRestAtKm - travelledKm) * 100) / 100;
              if (!nextThresholdKm || d < nextThresholdKm) { nextThresholdKm = d; nextThresholdKind = "rest"; }
            }

            const sf = stopFlowRef.current;
            narratorStateRef.current = {
              legTotalKm: Math.round(tr.totalKm * 100) / 100,
              travelledKm: Math.round(travelledKm * 100) / 100,
              remainingKm: Math.round(remainingKm * 100) / 100,
              speedKmh,
              modeLabel: mode?.label ?? tr.modeId,
              fuelPct: fuelPctNarr,
              vehicleHealthPct,
              nextThresholdKm,
              nextThresholdKind,
              constraintKind: sf?.kind ?? null,
              constraintStatus: sf?.status ?? null,
              constraintStopName: sf?.stop?.place_name ?? null,
              destinationLabel: destinationLabel || null,
            };
          }

          // Vehicle wear + breakdown (owned bicycle/motorbike/car only)
          if (
            (tr.modeId === "bicycle" || tr.modeId === "motorbike" || tr.modeId === "car") &&
            ownedModesRef.current.has(tr.modeId)
          ) {
            const vId = tr.modeId as VehicleId;
            const v = vehicleStateRef.current[vId];
            if (v?.status === "ok") {
              const lastWearKm = (tr as any).lastWearKm as number | undefined;
              const prevKm = typeof lastWearKm === "number" ? lastWearKm : travelledKm;
              (tr as any).lastWearKm = travelledKm;
              const deltaKm = Math.max(0, travelledKm - prevKm);
              if (deltaKm > 0.02) {
                // Base wear rate
                const baseWearRate = VEHICLE_WEAR_PCT_PER_KM[vId] ?? 0.15;
                
                // Real-life factors affecting wear:
                // 1. Speed factor: faster speeds cause more wear (exponential relationship)
                const mode = TRAVEL_MODES.find((m) => m.id === vId);
                const speedKmh = mode?.speedKmh ?? 50;
                // Normalize speed factor: 1.0 at 50kmh, increases exponentially above that
                // Bicycles (7kmh) = 0.4x, Motorbikes (55kmh) = 1.2x, Cars (80kmh) = 1.5x
                const speedFactor = Math.pow(speedKmh / 50, 1.3);
                
                // 2. Health condition factor: vehicles in poor condition wear faster
                const currentHealth = v.healthPct;
                const healthFactor = currentHealth <= 20 ? 1.4 : currentHealth <= 40 ? 1.2 : 1.0;
                
                // 3. Road conditions factor (simplified - assume urban roads = 1.0, could add terrain later)
                const roadFactor = 1.0;
                
                // Calculate final wear with all factors
                const wear = deltaKm * baseWearRate * speedFactor * healthFactor * roadFactor;
                setVehicleState((prev: any) => {
                  const cur = prev[vId];
                  if (!cur || cur.status !== "ok") return prev;
                  const nextPct = Math.max(0, cur.healthPct - wear);
                  const crossedWarn = !cur.warnedLow && nextPct <= MAINT_WARN_PCT;
                  const broke = nextPct <= 0;
                  const next = {
                    ...prev,
                    [vId]: {
                      ...cur,
                      healthPct: nextPct,
                      warnedLow: cur.warnedLow || crossedWarn,
                      status: broke ? "broken_needs_tow" : cur.status,
                    },
                  };
                  if (crossedWarn) {
                    setToast({
                      title: "Maintenance alert",
                      message: `${TRAVEL_MODES.find((m) => m.id === vId)?.label ?? "Vehicle"} is at ${MAINT_WARN_PCT}% health. Service it soon.`,
                    });
                  }
                  if (broke) {
                    // Breakdown: stop and force mode switch. Tow required before repair begins.
                    setToast({
                      title: "Breakdown",
                      message: "Your vehicle broke down. Pay tow to send it for repair (1h).",
                    });
                    setBreakdownFlow({ modeId: vId });
                    setDrawer("breakdown");
                    // Keep destination so user can continue with another mode.
                    setPendingDestination(tr.to);
                    setPendingDestinationLabel(destinationLabel || "Destination");
                    setIsTraveling(false);
                    travelRef.current = null;
                    setProgress(0);
                    setPlayerPos(nextPos);
                  }
                  return next;
                });
              }
            }
          }

          const busStop = () => {
            const pausedAt = Date.now();
            pauseRef.current = { startedAt: pausedAt };
            setTravelPause({
              kind: "bus_stop",
              label: "Bus stop: alight / board",
              startedAt: pausedAt,
              totalMs: BUS_STOP_SECONDS * 1000,
            });
            emitHuntPlayerAction("travel_paused", {
              modeId: tr.modeId,
              startedAt: new Date(tr.startedAt).toISOString(),
              durationMs: tr.durationMs,
              routeCoords: serializeRouteCoords(tr.coords),
              pausedAt: new Date(pausedAt).toISOString(),
              totalMs: BUS_STOP_SECONDS * 1000,
            });
            busPauseOpenedRef.current = true;
            setDrawer("constraint");
            tr.nextBusStopAtKm = tr.nextBusStopAtKm! + BUS_STOP_EVERY_KM;
          };

          const triggerDetour = (kind: "rejuvenate" | "refuel" | "rest", costCoins: number, isSecondWarning?: boolean) => {
            // Avoid stacking stops (unless second warning which re-prompts).
            if (stopFlow && !isSecondWarning) return;
            // End current travel leg and reroute to a nearby stop.
            setIsTraveling(false);
            travelRef.current = null;
            setProgress(0);
            setPlayerPos(nextPos);

            const finalTo = tr.to;
            const finalLabel = destinationLabel || "Destination";
            const actionSeconds = kind === "refuel" ? 120 : 180; // 2m refuel, 3m rest/rejuvenate
            setStopFlow({
              kind,
              modeId: tr.modeId,
              status: "finding",
              finalTo,
              finalLabel,
              costCoins,
              actionSeconds,
              error: null,
              isSecondWarning: isSecondWarning ?? false,
            });
            setDrawer("constraint");

            void (async () => {
              try {
                // Choose a stop *ahead* on the route, not behind.
                const pointAlongKm = (kmFromStart: number) => {
                  const km = clamp(kmFromStart, 0, tr.totalKm);
                  let j = 1;
                  while (j < tr.cumKm.length && tr.cumKm[j] < km) j++;
                  j = clamp(j, 1, tr.cumKm.length - 1);
                  const prevKm = tr.cumKm[j - 1];
                  const segKm = tr.cumKm[j] - prevKm || 1e-9;
                  const t = clamp((km - prevKm) / segKm, 0, 1);
                  const a2 = tr.coords[j - 1];
                  const b2 = tr.coords[j];
                  return { lng: a2[0] + (b2[0] - a2[0]) * t, lat: a2[1] + (b2[1] - a2[1]) * t } as LngLat;
                };

                /** Project a point onto the route; return km-from-start at the closest point on the route. */
                const kmAlongRouteAt = (point: LngLat): number => {
                  let bestKm = 0;
                  let bestD = Infinity;
                  for (let i = 0; i < tr.coords.length - 1; i++) {
                    const a = { lng: tr.coords[i][0], lat: tr.coords[i][1] };
                    const b = { lng: tr.coords[i + 1][0], lat: tr.coords[i + 1][1] };
                    const segKm = haversineKm(a, b) || 1e-9;
                    const dToA = haversineKm(point, a);
                    const dToB = haversineKm(point, b);
                    const t = clamp(
                      (dToA * dToA + segKm * segKm - dToB * dToB) / (2 * segKm * segKm),
                      0,
                      1,
                    );
                    const proj = { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };
                    const d = haversineKm(point, proj);
                    if (d < bestD) {
                      bestD = d;
                      const cumStart = tr.cumKm[i] ?? 0;
                      const cumEnd = tr.cumKm[i + 1] ?? cumStart + segKm;
                      bestKm = cumStart + t * (cumEnd - cumStart);
                    }
                  }
                  return bestKm;
                };
                const curRemain = haversineKm(nextPos, finalTo);
                const isRelaxKind = kind === "rejuvenate" || kind === "rest";
                // For relax: single nearby search (one API call) — user can choose to relax or rest in place.
                const aheadKms =
                  isRelaxKind && !isSecondWarning
                    ? [2]
                    : isSecondWarning
                      ? [3, 6, 12, 24]
                      : [2, 6, 14, 26];
                let stop: { place_name: string; center: [number, number] } | null = null;
                for (const aheadKm of aheadKms) {
                  const anchor = pointAlongKm(Math.min(tr.totalKm, travelledKm + aheadKm));
                  const candidate = await findNearbyStop(kind, anchor);
                  const candidatePos: LngLat = { lng: candidate.center[0], lat: candidate.center[1] };
                  const candRemain = haversineKm(candidatePos, finalTo);
                  const distPlayerToStopKm = haversineKm(nextPos, candidatePos);
                  if (isRelaxKind && distPlayerToStopKm > REJUVENATE_MAX_DISTANCE_KM) continue;
                  if (isRelaxKind) {
                    const stopKmAlongRoute = kmAlongRouteAt(candidatePos);
                    if (stopKmAlongRoute < travelledKm) continue;
                    if (stopKmAlongRoute - travelledKm > REJUVENATE_MAX_DISTANCE_KM) continue;
                  }
                  if (candRemain <= curRemain + 1) {
                    stop = candidate;
                    break;
                  }
                }
                if (!stop && !isRelaxKind) {
                  stop = await findNearbyStop(kind, nextPos);
                }
                if (!stop && isRelaxKind) {
                  throw new Error("No relax within 2.5 miles ahead on route");
                }
                if (stop && isRelaxKind) {
                  const stopPosCheck: LngLat = { lng: stop.center[0], lat: stop.center[1] };
                  if (haversineKm(nextPos, stopPosCheck) > REJUVENATE_MAX_DISTANCE_KM) throw new Error("No relax within 2.5 miles");
                  if (kmAlongRouteAt(stopPosCheck) < travelledKm) throw new Error("No relax ahead on route");
                }
                if (!stop) throw new Error("No nearby stop");
                const stopPos: LngLat = { lng: stop.center[0], lat: stop.center[1] };
                const prof = profileForMode(tr.modeId);
                const [toStop, toFinal] = await Promise.all([
                  getDirections(nextPos, stopPos, prof),
                  getDirections(stopPos, finalTo, prof),
                ]);
                // Relax/rejuvenate: reject if route distance > 2.5 miles.
                const routeDistanceM = Number(toStop.distanceMeters);
                if (isRelaxKind && Number.isFinite(routeDistanceM) && routeDistanceM > REJUVENATE_MAX_DISTANCE_M) {
                  throw new Error("No relax within 2.5 miles");
                }

                setStopFlow((s) =>
                  s
                    ? {
                        ...s,
                        status: "to_stop",
                        stop,
                        resumeCoords: toFinal.coords,
                        resumeEtaSeconds: toFinal.durationSeconds,
                        error: null,
                        distanceMetersToStop: toStop.distanceMeters,
                        durationSecondsToStop: toStop.durationSeconds,
                        coordsToStop: toStop.coords,
                      }
                    : s,
                );
                setDestination(stopPos);
                setRouteCoords(toStop.coords);
                arrivalActionRef.current = () => {
                  setStopFlow((s) =>
                    s ? { ...s, status: "relaxing", startedAt: Date.now() } : s,
                  );
                  // Don't auto-open constraint drawer on arrival - user can tap gateway button if needed
                };
                // Do not auto-start: let the user choose "Go to this stop" or "Cancel" in the drawer.
              } catch (e: any) {
                // No relax/refuel venue within range. For rejuvenate/rest: offer rest in place (5 min) instead of sending them far.
                const isRelaxKind = kind === "rejuvenate" || kind === "rest";
                if (isRelaxKind) {
                  const restStop = { place_name: "Rest here (5 min)", center: [nextPos.lng, nextPos.lat] as [number, number] };
                  setRouteCoords([]);
                  setDestination(null);
                  setStopFlow((s) =>
                    s
                      ? {
                          ...s,
                          status: "to_stop",
                          stop: restStop,
                          restInPlace: true,
                          costCoins: 0,
                          actionSeconds: REST_IN_PLACE_SECONDS,
                          error: null,
                          distanceMetersToStop: 0,
                          durationSecondsToStop: 0,
                          coordsToStop: [],
                        }
                      : s,
                  );
                  arrivalActionRef.current = () => {
                    setStopFlow((s) =>
                      s ? { ...s, status: "relaxing", startedAt: Date.now() } : s,
                    );
                    // Don't auto-open constraint drawer on arrival - user can tap gateway button if needed
                  };
                  void (async () => {
                    const prof = profileForMode(tr.modeId);
                    const dirs = await getDirections(nextPos, finalTo, prof);
                    if (dirs?.coords?.length >= 2) {
                      setStopFlow((s) =>
                        s
                          ? { ...s, resumeCoords: dirs.coords, resumeEtaSeconds: dirs.durationSeconds }
                          : s,
                      );
                    }
                  })();
                  return;
                }
                // Refuel or other: show error and fall back to roadside stop.
                const errorMessage = e?.message || "Failed to find nearby stop";
                setStopFlow((s) =>
                  s
                    ? {
                        ...s,
                        status: "finding",
                        error: errorMessage,
                      }
                    : s,
                );
                const fallbackStop: LngLat = {
                  lng: nextPos.lng + 0.002,
                  lat: nextPos.lat + 0.001,
                };
                try {
                  const prof = profileForMode(tr.modeId);
                  const [toStop, toFinal] = await Promise.all([
                    getDirections(nextPos, fallbackStop, prof),
                    getDirections(fallbackStop, finalTo, prof),
                  ]);
                  setStopFlow((s) =>
                    s
                      ? {
                          ...s,
                          status: "to_stop",
                          stop: { place_name: "Roadside stop", center: [fallbackStop.lng, fallbackStop.lat] },
                          resumeCoords: toFinal.coords,
                          resumeEtaSeconds: toFinal.durationSeconds,
                          error: null,
                          distanceMetersToStop: toStop.distanceMeters,
                          durationSecondsToStop: toStop.durationSeconds,
                          coordsToStop: toStop.coords,
                        }
                      : s,
                  );
                  setDestination(fallbackStop);
                  setRouteCoords(toStop.coords);
                  arrivalActionRef.current = () => {
                    setStopFlow((s) =>
                      s ? { ...s, status: "relaxing", startedAt: Date.now() } : s,
                    );
                    // Don't auto-open constraint drawer on arrival - user can tap gateway button if needed
                  };
                } catch {
                  setStopFlow((s) =>
                    s ? { ...s, status: "finding", error: e?.message || "Failed to find stop" } : s,
                  );
                }
              }
            })();
          };

          // Consequence after ignoring rejuvenate/refuel/rest (must run after triggerDetour is defined)
          const cTrig = consequenceTriggerRef.current;
          if (cTrig && travelledKm >= cTrig.triggerAfterKm) {
            const pos = nextPos;
            const kind = cTrig.kind;
            const stage = cTrig.stage;

            if (kind === "faint" && stage === "second_warning") {
              consequenceTriggerRef.current = null;
              setFaintDangerActive(false);
              setIsTraveling(false);
              travelRef.current = null;
              setProgress(0);
              setRouteCoords([]);
              setDestination(null);
              const cost = tr.modeId === "bicycle" ? COST_REJUVENATE_BIKE : COST_REJUVENATE_WALK;
              triggerDetour("rejuvenate", cost, true);
              return;
            }

            if (kind === "faint" && (stage === "faint" || !stage)) {
              consequenceTriggerRef.current = null;
              setFaintDangerActive(false);
              setIsTraveling(false);
              travelRef.current = null;
              setProgress(0);
              setRouteCoords([]);
              setDestination(null);
              huntDestinationAfterHospitalRef.current = { to: tr.to, label: destinationLabel || "Destination", modeId: tr.modeId };
              if (tr.modeId === "bicycle") {
                bicycleFaintRef.current = { wasRental: !ownedModesRef.current.has("bicycle") };
              }
              setDrawer("hospital");
              setFaintPhase({
                at: pos,
                startedAt: Date.now(),
                ambulanceArrivalMs: AMBULANCE_ARRIVAL_MS,
                routeCoords: tr.coords,
                forwardTo: tr.to,
              });
              setToast({ title: "You fainted", message: "Ambulance is on the way (2 min)." });
              return;
            }

            consequenceTriggerRef.current = null;
            setIsTraveling(false);
            travelRef.current = null;
            setProgress(0);
            setRouteCoords([]);
            setDestination(null);
            setDrawer(null);
            void (async () => {
              try {
                if (kind === "out_of_fuel") {
                  const gas = await findNearbyStop("refuel", pos);
                  const to = { lng: gas.center[0], lat: gas.center[1] };
                  const dirs = await getDirections(pos, to, "walking");
                  if (dirs?.coords?.length >= 2) {
                    consequenceReturnToRef.current = pos;
                    startTravelWithRoute(pos, to, dirs.coords, "walk", dirs.durationSeconds);
                    setToast({ title: "Out of fuel", message: "Walking to gas station, then back to your vehicle." });
                  }
                } else if (kind === "bike_repair") {
                  const shop = await findNearbyStop("rejuvenate", pos);
                  const to = { lng: shop.center[0], lat: shop.center[1] };
                  const dirs = await getDirections(pos, to, "walking");
                  if (dirs?.coords?.length >= 2) {
                    startTravelWithRoute(pos, to, dirs.coords, "walk", dirs.durationSeconds);
                    setToast({ title: "Bike repair", message: "Walking to the nearest bike shop." });
                  }
                }
              } catch (_) {
                setToast({ title: "Error", message: "Could not find a place nearby. Try again." });
              }
            })();
            return;
          }

          if (tr.modeId === "bus" && tr.nextBusStopAtKm && travelledKm >= tr.nextBusStopAtKm) {
            busStop();
            return;
          }

          // Do not trigger rejuvenate/refuel/rest when we're being taken to hospital (would show wrong "Stop" modal).
          if (!travellingToHospitalRef.current) {
            // Near-arrival safeguard: don't force detours when basically at destination.
            const remainingKm = Math.max(0, tr.totalKm - travelledKm);
            const pForDetours = tr.modeId === "walk" ? pAnim : pGame;
            const blockDetours = pForDetours >= 0.9 || remainingKm <= 2;

            if (
              !blockDetours &&
              tr.modeId === "walk" &&
              tr.nextRejuvenateAtKm &&
              travelledKm >= tr.nextRejuvenateAtKm
            ) {
              triggerDetour("rejuvenate", COST_REJUVENATE_WALK);
              return;
            }

            if (
              !blockDetours &&
              tr.modeId === "bicycle" &&
              tr.nextRejuvenateAtKm &&
              travelledKm >= tr.nextRejuvenateAtKm
            ) {
              triggerDetour("rejuvenate", COST_REJUVENATE_BIKE);
              return;
            }

            if (
              !blockDetours &&
              (tr.modeId === "motorbike" || tr.modeId === "car") &&
              tr.nextRefuelAtKm
            ) {
              const refuelInterval = tr.modeId === "car" ? CAR_REFUEL_EVERY_KM : MOTO_REFUEL_EVERY_KM;
              const fuelRemainingKm = Math.max(0, tr.nextRefuelAtKm - travelledKm);
              const fuelPct = refuelInterval > 0 ? (100 * fuelRemainingKm) / refuelInterval : 0;
              if (fuelPct <= LOW_FUEL_WARN_PCT && !warnedLowFuelRef.current) {
                warnedLowFuelRef.current = true;
                setToast({
                  title: "Low fuel warning",
                  message: `${TRAVEL_MODES.find((m) => m.id === tr.modeId)?.label ?? "Vehicle"} fuel low (${Math.round(fuelPct)}%). Find a filling station soon.`,
                });
              }
              if (travelledKm >= tr.nextRefuelAtKm) {
                warnedLowFuelRef.current = false;
                triggerDetour("refuel", tr.modeId === "car" ? COST_REFUEL_CAR : COST_REFUEL_MOTO);
                return;
              }
            }

            if (
              !blockDetours &&
              (tr.modeId === "motorbike" || tr.modeId === "car") &&
              tr.nextRestAtKm &&
              travelledKm >= tr.nextRestAtKm
            ) {
              triggerDetour("rest", COST_REST_DRIVE);
              return;
            }
          }

          // Walk: end as soon as the avatar enters the arrival zone (or the DB quiz waypoint when it matches this trip).
          // Requiring pAnim>=0.99 as well left some users stuck at "WALKING…" while already on the pin.
          const cw = currentWaypointRef.current;
          const hp = huntPhaseRef.current;
          const kRef = keysRef.current;
          const routeTargetsQuizWaypoint =
            cw == null || haversineKm(tr.to, cw) <= 2;
          const nearQuizWaypoint =
            tr.modeId === "walk" &&
            hp === "hunt" &&
            kRef < keysToWin &&
            cw != null &&
            routeTargetsQuizWaypoint &&
            haversineKm(nextPos, cw) <= ARRIVAL_RADIUS_KM;
          const walkArrived =
            tr.modeId === "walk" && (distToDestKm <= ARRIVAL_RADIUS_KM || nearQuizWaypoint);
          const gameTimeComplete = tr.modeId === "walk" ? walkArrived : pGame >= 0.999;
          const avatarAtDestination =
            tr.modeId === "walk" ? walkArrived : pAnim >= 0.999 || distToDestKm <= ARRIVAL_RADIUS_KM;
          if (gameTimeComplete && avatarAtDestination) {
            const lastCoord = tr.coords[tr.coords.length - 1];
            const arrivalPos = lastCoord ? { lng: lastCoord[0], lat: lastCoord[1] } : tr.to;
            lastArrivalAtRef.current = Date.now();
            if (activeHuntId && user?.id && supabase) {
              const playerName = (profile?.username as string) || "Player";
              refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
              supabase
                .from("player_positions")
                .upsert(
                  {
                    hunt_id: activeHuntId,
                    player_id: user.id,
                    player_name: playerName,
                    lng: arrivalPos.lng,
                    lat: arrivalPos.lat,
                    keys,
                    travel_mode: tr.modeId,
                    travel_started_at: null,
                    travel_duration_ms: null,
                    active_client_id: getClientId(),
                    last_active_at: new Date().toISOString(),
                    ...getHuntsMapCameraDbFields(),
                  },
                  { onConflict: "hunt_id,player_id" }
                )
                .then(({ error }: { error: unknown }) => {
                  if (error) console.warn("[Hunts] arrival upsert error", error);
                });
            }
            if (tr.modeId === "bus" && tr.finalDestination) {
              const finalDest = tr.finalDestination;
              setIsTraveling(false);
              travelRef.current = null;
              setProgress(0);
              setPlayerPos(arrivalPos);
              setTravelModeId("walk");
              getDirections(arrivalPos, finalDest, "walking")
                .then((walkRoute) => {
                  if (walkRoute?.coords?.length) {
                    const walkEta = walkRoute.durationSeconds;
                    startTravelWithRoute(arrivalPos, finalDest, walkRoute.coords, "walk", walkEta);
                    setToast({
                      title: "Arrived at bus stop",
                      message: "Walking to destination",
                    });
                  } else {
                    setToast({
                      title: "Route unavailable",
                      message: "Couldn't find a walking path from this bus stop. Move a bit and try again.",
                    });
                  }
                })
                .catch(() => {
                  setToast({
                    title: "Route unavailable",
                    message: "Couldn't find a walking path from this bus stop. Move a bit and try again.",
                  });
                });
              suppressKeyRef.current = false;
              return;
            }

            setIsTraveling(false);
            travelRef.current = null;
            setProgress(0);
            setPlayerPos(arrivalPos);
            const after = arrivalActionRef.current;
            arrivalActionRef.current = null;
            if (after) {
              if (tr.modeId === "plane") {
                // 5 min disembarking delay; effect will call after() when timer ends
                setPlaneFlow((p) =>
                  p
                    ? {
                        ...p,
                        stage: "disembarking",
                        disembarkingEndsAt: Date.now() + PLANE_DISEMBARKING_MINUTES * 60 * 1000,
                      }
                    : p,
                );
                arrivalActionRef.current = after;
                setToast({
                  title: "Landed",
                  message: `Disembarking. You can continue in ${PLANE_DISEMBARKING_MINUTES} minutes.`,
                });
              } else {
                after();
              }
              suppressKeyRef.current = false;
              return;
            }

            // Out-of-fuel consequence: return leg from gas station back to vehicle
            const returnTo = consequenceReturnToRef.current;
            if (returnTo) {
              consequenceReturnToRef.current = null;
              getDirections(tr.to, returnTo, "walking")
                .then((walkRoute) => {
                  if (walkRoute?.coords?.length >= 2) {
                    startTravelWithRoute(tr.to, returnTo, walkRoute.coords, "walk", walkRoute.durationSeconds);
                    setToast({ title: "Got fuel", message: "Walking back to your vehicle." });
                  }
                })
                .catch(() => {
                  setToast({
                    title: "Route unavailable",
                    message: "Couldn't find a walking path back to your vehicle. Move slightly and try again.",
                  });
                });
              suppressKeyRef.current = false;
              return;
            }

            // Faint consequence: arrived at hospital → remove red marker/route, then 30 min stay then pay bill
            if (travellingToHospitalRef.current) {
              travellingToHospitalRef.current = false;
              setIsTravellingToHospital(false);
              setDestination(null);
              setRouteCoords([]);
              const stayRealMs = (HOSPITAL_STAY_MINUTES * 60 * 1000) / STOP_SPEEDUP;
              const bikeFee =
                bicycleFaintRef.current?.wasRental === true
                  ? BICYCLE_RECOVERY_REPAIR_COST_RENTAL
                  : bicycleFaintRef.current?.wasRental === false
                    ? BICYCLE_RECOVERY_REPAIR_COST_OWNED
                    : 0;
              setHospitalStay({
                startedAt: Date.now(),
                durationMs: stayRealMs,
                costCoins: HOSPITAL_BILL + bikeFee,
                at: tr.to,
                bikeRecoveryIncluded: bikeFee > 0,
              });
              setDrawer("hospital");
              const stayMin = Math.ceil((HOSPITAL_STAY_MINUTES * 60 * 1000) / STOP_SPEEDUP / (60 * 1000));
              setToast({ title: "At hospital", message: `Recovering. Stay for ${stayMin} minutes, then pay the bill.` });
              suppressKeyRef.current = false;
              return;
            }

            // Retry checkpoint: after a fail, player must travel back here to re-attempt.
            const retry = unlockRetryRef.current;
            if (retry) {
              const d = haversineKm(tr.to, retry.to);
              if (d <= 0.35) {
                setUnlockRetry(null);
                setUnlockCheckpoint(retry);
                setClueUnlocked(true);
                setUnlockTaskStage("intro");
                setUnlockTaskQuestion(null);
                setUnlockTaskDeadlineMs(null);
                setUnlockAnswer("");
                setUnlockError(null);
                setDrawer("status");
                suppressKeyRef.current = false;
                return;
              }
            }

            // Anti-cheat: if the player reaches a future waypoint without solving the current task,
            // relocate them to a random address anywhere in Nigeria and reset.
            // IMPORTANT: derive from actual hunt waypoint progression (keys), not unlock-task modulo math.
            // This prevents false positives where a valid destination is misidentified as locked.
            const hp = huntPhaseRef.current;
            const allowedCurrent =
              hp === "public_task"
                ? (huntNextLocations[0] ?? null)
                : clueUnlockedRef.current
                  ? (() => {
                      const k = keysRef.current;
                      // Allowed destination while hunting is waypoint index = keys.
                      return huntNextLocations[k] ?? null;
                    })()
                  : null;
            const lockedNext =
              hp === "public_task"
                ? (huntNextLocations[1] ?? null)
                : clueUnlockedRef.current
                  ? (() => {
                      const k = keysRef.current;
                      // Allowed destination while hunting is waypoint index = keys.
                      // Locked destination is the immediate next waypoint (keys + 1), if it exists.
                      return huntNextLocations[k + 1] ?? null;
                    })()
                  : null;
            if (lockedNext) {
              const d = haversineKm(tr.to, lockedNext.to);
              // Only treat as cheating when the player is essentially "at" the locked waypoint,
              // and not merely near it because waypoints are close together in the same area.
              const farFromAllowed =
                allowedCurrent ? haversineKm(tr.to, allowedCurrent.to) > Math.max(0.25, CHEAT_LOCKED_DESTINATION_MATCH_KM * 2) : true;
              if (d <= CHEAT_LOCKED_DESTINATION_MATCH_KM && farFromAllowed) {
                if (hp === "public_task") {
                  void failPublicTask("cheat");
                } else {
                  void failUnlockTask("cheat");
                }
                suppressKeyRef.current = false;
                return;
              }
            }
            if (!suppressKeyRef.current) {
              if (huntPhase === "public_trip") {
                // Public first location: task unlocks the next location (no key game yet).
                setHuntPhase("public_task");
                setPublicTaskAnswer("");
                setPublicTaskError(null);
                setArrivedForChallenge(false);
                setClueUnlocked(false);
                setRps(null);
                resetClueSearch();
                setDrawer("status");
              } else {
                // From the next locations onward: with active hunt go straight to quiz (OpenAI); otherwise RPS then quiz.
                setArrivedForChallenge(true);
                setPendingDestination(null);
                setPendingDestinationLabel("");
                if (activeHuntId) {
                  setClueUnlocked(true);
                  setArrivalChallengeIntro(false);
                } else {
                  setArrivalChallengeIntro(true);
                  setClueUnlocked(false);
                }
                setRps(null);
                resetClueSearch();
                setDrawer("status");
              }
            }
            suppressKeyRef.current = false;
          }
        }
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [isTraveling, keysToWin, travelPause, stopFlow, destinationLabel, demoUnlockTasks]);

  const drawerTitle = useMemo(() => {
    if (drawer === "status") return "Status";
    if (drawer === "leaderboard") return "Leaderboard";
    if (drawer === "breakdown") return "Breakdown";
    if (drawer === "garage") return "Garage";
    if (drawer === "destination") return "Destination";
    if (drawer === "travel") return "Travel";
    if (drawer === "constraint" && (hospitalStay || isTravellingToHospital)) return "Hospital";
    if (drawer === "constraint") return "Stop";
    if (drawer === "hospital") return "Hospital";
    if (drawer === "plane") return "Plane";
    if (drawer === "inventory") return "Inventory";
    if (drawer === "coins") return "Coins";
    return "";
  }, [drawer, hospitalStay, isTravellingToHospital]);

  const travelOffers = useMemo<TravelOffer[]>(() => {
    const dest =
      pendingDestination ||
      (isTraveling && destination ? destination : null) ||
      (huntPhase === "public_trip" && publicLocation ? publicLocation : null) ||
      (drawer === "travel" && nextCheckpointForTravel ? nextCheckpointForTravel.to : null);
    if (!dest || !playerPos) return [];

    const drivingMeters =
      Number.isFinite(baseDirs.driving?.distanceMeters) && (baseDirs.driving?.distanceMeters ?? 0) > 0
        ? (baseDirs.driving!.distanceMeters as number)
        : NaN;
    const walkingMeters =
      Number.isFinite(baseDirs.walking?.distanceMeters) && (baseDirs.walking?.distanceMeters ?? 0) > 0
        ? (baseDirs.walking!.distanceMeters as number)
        : Number.isFinite(drivingMeters)
          ? drivingMeters
          : NaN;

    const distKm = Number.isFinite(drivingMeters)
      ? drivingMeters / 1000
      : haversineKm(playerPos, dest);

    const own = (id: TravelModeId) => ownedModes.has(id);
    const secsFor = (meters: number, speedKmh: number, mult = 1) => {
      if (!Number.isFinite(meters) || meters <= 0) return null;
      const mps = (speedKmh * 1000) / 3600;
      return Math.max(1, Math.round((meters / mps) * mult));
    };
    const roundMoney = (n: number) => Math.max(0, Math.round(n / 10) * 10);
    const capMoney = (n: number, cap: number) => Math.min(cap, roundMoney(n));
    const rentByDistance = (modeId: TravelModeId) => {
      const km = distKm;
      if (!Number.isFinite(km) || km <= 0) return null;
      const from = RENT_FROM[modeId];
      const cap = RENT_CAP[modeId];
      if (modeId === "bicycle" && from != null && cap != null) return capMoney(from + km * 18, cap);
      if (modeId === "motorbike" && from != null && cap != null) return capMoney(from + km * 35, cap);
      return null;
    };
    const carRentByDistance = () => {
      const km = distKm;
      if (!Number.isFinite(km) || km <= 0) return null;
      const from = RENT_FROM.car;
      const cap = RENT_CAP.car;
      if (from != null && cap != null) return capMoney(from + km * 55, cap);
      return capMoney(650 + km * 55, 8000);
    };
    const busFare = () => {
      const km = distKm;
      if (!Number.isFinite(km) || km <= 0) return null;
      return capMoney(BUS_FARE_BASE + km * 12, BUS_FARE_CAP);
    };

    const carOwned = own("car");
    const bikeOwned = own("bicycle");
    const motoOwned = own("motorbike");
    const bikeUsable = bikeOwned ? canUseOwnedVehicle("bicycle") : false;
    const motoUsable = motoOwned ? canUseOwnedVehicle("motorbike") : false;
    const carUsable = carOwned ? canUseOwnedVehicle("car") : false;

    const walkMove = secsFor(walkingMeters, 5);
    const driveMove = secsFor(drivingMeters, 55); // baseline for road vehicles (demo)
    const planeEligible = Number.isFinite(distKm) && distKm >= PLANE_MIN_KM;

    const driveTraffic = baseDirs.driving;
    const roadDurSec =
      driveTraffic &&
      Number.isFinite(driveTraffic.durationSeconds) &&
      driveTraffic.durationSeconds > 0
        ? driveTraffic.durationSeconds
        : null;
    const trafficDelayForUi =
      driveTraffic?.trafficDelaySeconds != null &&
      Number.isFinite(driveTraffic.trafficDelaySeconds)
        ? driveTraffic.trafficDelaySeconds
        : null;
    const altRoute = driveTraffic?.alternate;
    const trafficAlternateAvailable =
      !!altRoute &&
      altRoute.coords.length >= 2 &&
      Number.isFinite(altRoute.durationSeconds) &&
      roadDurSec != null &&
      (altRoute.durationSeconds <= roadDurSec - 45 ||
        altRoute.durationSeconds <= roadDurSec * 0.92);
    const typicalDur = driveTraffic?.durationTypicalSeconds;
    const busSuggestAlightWalk =
      roadDurSec != null &&
      ((trafficDelayForUi != null && trafficDelayForUi >= 90) ||
        (typicalDur != null &&
          Number.isFinite(typicalDur) &&
          typicalDur > 0 &&
          roadDurSec / typicalDur >= 1.18));

    const carEtaFromTraffic = roadDurSec != null ? Math.round(roadDurSec) : null;
    const motoEtaFromTraffic =
      roadDurSec != null ? Math.round(roadDurSec * 0.95) : null;
    const busEtaFromTraffic = roadDurSec != null ? Math.round(roadDurSec * 1.12) : null;
    const altEtaCar =
      altRoute && Number.isFinite(altRoute.durationSeconds)
        ? Math.round(altRoute.durationSeconds)
        : null;
    const altEtaMoto =
      altRoute && Number.isFinite(altRoute.durationSeconds)
        ? Math.round(altRoute.durationSeconds * 0.95)
        : null;

    const out: TravelOffer[] = [
      {
        modeId: "walk",
        label: "Walk",
        icon: "directions_walk",
        enabled: true,
        canOwn: true,
        owned: true,
        prepSeconds: 0,
        etaSeconds: walkMove,
        profile: "walking",
      },
      {
        modeId: "bicycle",
        label: "Bicycle",
        icon: "directions_bike",
        enabled: true,
        canOwn: true,
        owned: bikeOwned,
        ownedUsable: bikeOwned ? bikeUsable : false,
        ownedBlockedReason: bikeOwned ? vehicleBlockedReason("bicycle") : null,
        buyCost: BUY_COST.bicycle ?? 2500,
        rentCost:
          bikeOwned && !bikeUsable
            ? rentByDistance("bicycle") ?? undefined
            : bikeOwned
              ? undefined
              : rentByDistance("bicycle") ?? undefined,
        prepSeconds: bikeOwned ? 0 : getPickupSeconds("bicycle"),
        prepLabel: bikeOwned ? undefined : "Walk to bicycle pickup",
        // Use road distance to keep bicycle slower than motorbike/bus consistently (move time only)
        etaSeconds: driveMove == null ? null : Math.round(driveMove * (55 / (TRAVEL_MODES.find((m) => m.id === "bicycle")?.speedKmh ?? 7))),
        profile: "driving",
      },
      {
        modeId: "motorbike",
        label: "Motorbike",
        icon: "two_wheeler",
        enabled: true,
        canOwn: true,
        owned: motoOwned,
        ownedUsable: motoOwned ? motoUsable : false,
        ownedBlockedReason: motoOwned ? vehicleBlockedReason("motorbike") : null,
        buyCost: BUY_COST.motorbike ?? 9000,
        rentCost:
          motoOwned && !motoUsable
            ? rentByDistance("motorbike") ?? undefined
            : motoOwned
              ? undefined
              : rentByDistance("motorbike") ?? undefined,
        prepSeconds: motoOwned ? 0 : getPickupSeconds("motorbike"),
        prepLabel: motoOwned ? undefined : "Walk to bike pickup",
        // move time only (prep shown separately)
        etaSeconds:
          motoEtaFromTraffic != null
            ? motoEtaFromTraffic
            : driveMove == null
              ? null
              : Math.round(driveMove * 0.95),
        profile: "driving",
        ...(trafficDelayForUi != null ? { trafficDelaySeconds: trafficDelayForUi } : {}),
        ...(trafficAlternateAvailable
          ? { trafficAlternateAvailable: true, trafficAlternateEtaSeconds: altEtaMoto }
          : {}),
      },
      {
        modeId: "car",
        label: "Car",
        icon: "directions_car",
        enabled: true,
        canOwn: true,
        owned: carOwned,
        ownedUsable: carOwned ? carUsable : false,
        ownedBlockedReason: carOwned ? vehicleBlockedReason("car") : null,
        buyCost: BUY_COST.car ?? 22000,
        rentCost:
          carOwned && !carUsable
            ? carRentByDistance() ?? undefined
            : carOwned
              ? undefined
              : carRentByDistance() ?? undefined,
        prepSeconds: carOwned ? 0 : getPickupSeconds("car"),
        prepLabel: carOwned ? undefined : "Rental car arriving",
        // move time only (prep shown separately)
        etaSeconds:
          carEtaFromTraffic != null
            ? carEtaFromTraffic
            : driveMove == null
              ? null
              : Math.round(driveMove),
        profile: "driving",
        ...(trafficDelayForUi != null ? { trafficDelaySeconds: trafficDelayForUi } : {}),
        ...(trafficAlternateAvailable
          ? { trafficAlternateAvailable: true, trafficAlternateEtaSeconds: altEtaCar }
          : {}),
      },
      {
        modeId: "bus",
        label: "Bus",
        icon: "directions_bus",
        enabled: true,
        canOwn: false,
        owned: false,
        farePerRide: busFare() ?? BUS_FARE_BASE,
        prepSeconds: getPickupSeconds("bus"),
        prepLabel: "Walk to bus stop (5m) + wait (2m)",
        // move time only (prep shown separately)
        etaSeconds:
          busEtaFromTraffic != null
            ? busEtaFromTraffic
            : driveMove == null
              ? null
              : Math.round(driveMove * 1.25),
        profile: "driving",
        ...(trafficDelayForUi != null ? { trafficDelaySeconds: trafficDelayForUi } : {}),
        ...(busSuggestAlightWalk ? { busSuggestAlightWalk: true } : {}),
      },
      {
        modeId: "plane",
        label: "Plane",
        icon: "flight_takeoff",
        enabled: planeEligible,
        canOwn: false,
        owned: false,
        fareCoins: planeEligible ? planeFareCoins(playerPos, dest) : undefined,
        prepSeconds: 0,
        prepLabel: planeEligible
          ? "Go to airport first (choose transfer mode)"
          : `Available for long trips only (${PLANE_MIN_KM}+ km)`,
        etaSeconds: planeEligible ? flightEtaSeconds(playerPos, dest) : null,
        profile: null,
      },
    ];

    // When prep is active with a non-walk mode (rent/board), lock all other modes — only the chosen mode stays enabled.
    if (prep && prep.modeId !== "walk") {
      return out.map((o) => ({
        ...o,
        enabled: o.modeId === prep.modeId,
      }));
    }

    return out;
  }, [
    baseDirs.driving?.distanceMeters,
    baseDirs.driving?.durationSeconds,
    baseDirs.driving?.trafficDelaySeconds,
    baseDirs.driving?.durationTypicalSeconds,
    baseDirs.driving?.alternate,
    baseDirs.walking?.distanceMeters,
    destination,
    drawer,
    huntPhase,
    isTraveling,
    nextCheckpointForTravel,
    ownedModes,
    pendingDestination,
    prep,
    playerPos,
    publicLocation,
  ]);

  // When opening travel drawer with no destination set, suggest the next checkpoint so ETAs and Rent/Use show — only after hunt has started.
  const prevDrawerForTravelRef = useRef<DrawerId | null>(null);
  useEffect(() => {
    const prev = prevDrawerForTravelRef.current;
    prevDrawerForTravelRef.current = drawer;
    if (!huntHasStarted) return;
    if (prev !== "travel" && drawer === "travel" && !pendingDestination && nextCheckpointForTravel) {
      setPendingDestination(nextCheckpointForTravel.to);
      setPendingDestinationLabel(nextCheckpointForTravel.label);
    }
  }, [drawer, nextCheckpointForTravel, pendingDestination, huntHasStarted]);

  // If Travel or Destination is open when the player enters a mandatory checkpoint zone, switch to Status (quiz/task).
  useEffect(() => {
    if (!huntHasStarted) return;
    if (!arrivedForChallenge && !isAtCurrentWaypoint) return;
    if (drawer === "travel" || drawer === "destination") {
      setDrawer("status");
    }
  }, [drawer, huntHasStarted, arrivedForChallenge, isAtCurrentWaypoint]);

  // Ensure we only emit the "avatar_before_go" debug log once per travel-drawer open.
  const hasLoggedHuntsBeforeGoRef = useRef(false);

  // Log Hunts avatar position when travel drawer is open (before Go/Rent/Board) for comparison with broadcast.
  useEffect(() => {
    if (drawer !== "travel") {
      hasLoggedHuntsBeforeGoRef.current = false;
      return;
    }
    if (isTraveling || !playerPos) return;
    if (hasLoggedHuntsBeforeGoRef.current) return;
    hasLoggedHuntsBeforeGoRef.current = true;
    const payload = {
      source: "hunts",
      kind: "avatar_before_go",
      huntId: activeHuntId ?? null,
      playerId: user?.id ?? null,
      position: { lng: playerPos.lng, lat: playerPos.lat },
    };
    fetch("/api/debug-log-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});

    // Log map camera state once (to diagnose "same coords, different visuals").
    try {
      const map = mapRef.current;
      if (map?.getCenter && map?.getZoom) {
        const c = map.getCenter();
        const camPayload = {
          source: "hunts",
          kind: "camera_state",
          huntId: activeHuntId ?? null,
          playerId: user?.id ?? null,
          position: { lng: playerPos.lng, lat: playerPos.lat },
          camera: {
            zoom: map.getZoom(),
            center: { lng: c.lng, lat: c.lat },
            bearing: typeof map.getBearing === "function" ? map.getBearing() : 0,
            pitch: typeof map.getPitch === "function" ? map.getPitch() : 0,
          },
        };
        fetch("/api/debug-log-position", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(camPayload),
        }).catch(() => {});
      }
    } catch {}

    // Also upsert the current standing position immediately so broadcast DB lng/lat matches hunts.
    if (activeHuntId && user?.id && supabase && !anotherDeviceActive) {
      const playerName = (profile?.username as string) || "Player";
      refreshHuntsMapCameraSnapshot(mapRef.current, mapContainerRef.current);
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
            active_client_id: getClientId(),
            last_active_at: new Date().toISOString(),
            ...getHuntsMapCameraDbFields(),
          } as any,
          { onConflict: "hunt_id,player_id" }
        )
        .then((r: { error: unknown }) => {
          if (r.error) console.warn("[Hunts] before-go upsert error", r.error);
        });
    }
  }, [drawer, isTraveling, playerPos?.lng, playerPos?.lat]);

  // As soon as travel drawer opens, apply loadout/default so pre-selected mode shows even before offers load.
  const travelDrawerOpenedRef = useRef(false);
  useEffect(() => {
    if (drawer !== "travel") {
      travelDrawerOpenedRef.current = false;
      return;
    }
    if (travelDrawerOpenedRef.current) return;
    travelDrawerOpenedRef.current = true;
    // When prep is active with non-walk mode, show that locked mode — not "walk" (which is the current HUD mode during prep walk).
    const preferredDefaultModeId =
      prep && prep.modeId !== "walk"
        ? prep.modeId
        : (profile?.default_travel_mode as TravelModeId | undefined) ?? travelModeId;
    const validModes: TravelModeId[] = ["walk", "bicycle", "motorbike", "car", "bus", "plane"];
    if (validModes.includes(preferredDefaultModeId)) {
      setTravelPickModeId(preferredDefaultModeId);
    }
  }, [drawer, profile?.default_travel_mode, travelModeId, prep]);

  // When travel offers load, ensure picked mode is enabled; else fall back to first enabled.
  const travelDrawerInitializedRef = useRef(false);
  useEffect(() => {
    if (drawer !== "travel") {
      travelDrawerInitializedRef.current = false;
      return;
    }
    if (travelDrawerInitializedRef.current || !travelOffers.length) return;
    travelDrawerInitializedRef.current = true;
    if (prep && prep.modeId !== "walk") {
      setTravelPickModeId(prep.modeId);
      return;
    }
    // Prefer the player's chosen default mode (from Status), if it’s available for this trip.
    const preferred =
      travelOffers.find((o) => o.modeId === travelPickModeId && o.enabled) ?? null;
    if (preferred) return;
    const firstEnabled = travelOffers.find((o) => o.enabled) ?? travelOffers[0];
    if (firstEnabled) setTravelPickModeId(firstEnabled.modeId);
  }, [drawer, travelOffers, travelPickModeId, prep]);

  // When prep locks a non-walk mode and travel drawer is open, keep travelPickModeId synced to the locked mode.
  useEffect(() => {
    if (drawer === "travel" && prep && prep.modeId !== "walk") {
      setTravelPickModeId(prep.modeId);
    }
  }, [drawer, prep]);

  const selectedTravelOffer = useMemo(() => {
    if (!travelOffers.length) return null;
    return travelOffers.find((o) => o.modeId === travelPickModeId) ?? travelOffers[0];
  }, [travelOffers, travelPickModeId]);

  function modeRoute(modeId: TravelModeId) {
    if (modeId === "walk") return baseDirs.walking;
    if (modeId === "bicycle") return baseDirs.driving ?? baseDirs.cycling;
    if (modeId === "car" || modeId === "motorbike") {
      const d = baseDirs.driving;
      if (
        d &&
        drivingRouteChoice === "alternate" &&
        d.alternate?.coords &&
        d.alternate.coords.length >= 2
      ) {
        return {
          coords: d.alternate.coords,
          durationSeconds: d.alternate.durationSeconds,
          distanceMeters: d.alternate.distanceMeters,
        };
      }
      return baseDirs.driving;
    }
    if (modeId === "bus") return baseDirs.driving;
    return undefined;
  }

  // Green dashed preview polyline for the selected mode in Travel (before Go); clears while moving or in ambulance leg.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("preview-travel-route") as
      | { setData: (data: GeoJSON.Feature<GeoJSON.LineString>) => void }
      | undefined;
    if (!source?.setData) return;

    if (isTraveling || isTravellingToHospital) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      });
      try {
        map.setLayoutProperty("preview-travel-route-direction", "visibility", "none");
      } catch {
        /* layer may not exist yet */
      }
      return;
    }

    let coords: Array<[number, number]> = [];
    const planningTrip =
      Boolean(pendingDestination || drawer === "travel" || destForDirs) &&
      (playerPos != null || routeCoords.length >= 2);
    if (planningTrip) {
      const picked = modeRoute(travelPickModeId);
      if (picked?.coords && picked.coords.length >= 2) {
        coords = picked.coords;
      } else if (routeCoords.length >= 2) {
        coords = routeCoords;
      }
    }

    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
    try {
      map.setLayoutProperty(
        "preview-travel-route-direction",
        "visibility",
        coords.length >= 2 ? "visible" : "none",
      );
    } catch {
      /* layer may not exist yet */
    }
  }, [
    mapReady,
    isTraveling,
    isTravellingToHospital,
    drawer,
    travelPickModeId,
    drivingRouteChoice,
    pendingDestination,
    routeCoords,
    playerPos,
    destForDirs,
    baseDirs.walking,
    baseDirs.cycling,
    baseDirs.driving,
  ]);

  /** Find nearest bus stop to the given coordinates. */
  async function findNearestBusStop(to: LngLat): Promise<LngLat | null> {
    try {
      const url = new URL("/api/osm/nearby", window.location.origin);
      url.searchParams.set("kind", "bus_stop");
      url.searchParams.set("lng", String(to.lng));
      url.searchParams.set("lat", String(to.lat));
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const json = await res.json();
      if (json?.center && Array.isArray(json.center) && json.center.length >= 2) {
        return { lng: json.center[0], lat: json.center[1] };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Point ~1km from the quiz waypoint toward the player — bus must end here (or farther), never at the quiz. */
  const BUS_STOP_DISTANCE_FROM_DEST_KM = 1;
  /** OSM bus stop is only used if it stays this far from the quiz; otherwise we use the geometric drop-off. */
  const MIN_BUS_TERMINUS_DISTANCE_FROM_QUIZ_KM = 0.85;

  function computeBusDropOff1kmFromQuiz(destination: LngLat, fromPos: LngLat): LngLat {
    const distKm = haversineKm(destination, fromPos);
    if (distKm >= 0.5) {
      const t = Math.min(1, BUS_STOP_DISTANCE_FROM_DEST_KM / distKm);
      return {
        lng: destination.lng + (fromPos.lng - destination.lng) * t,
        lat: destination.lat + (fromPos.lat - destination.lat) * t,
      };
    }
    const degPerKm = 1 / 111;
    return {
      lng: destination.lng,
      lat: destination.lat + degPerKm * BUS_STOP_DISTANCE_FROM_DEST_KM,
    };
  }

  async function beginTravelWithMode(modeId: TravelModeId) {
    if (anotherDeviceActive) return;
    if (travelActionLockRef.current) return;
    // Hard block: unresolved stop/hospital enforcement must be handled first.
    if (
      stopFlow?.status === "to_stop" ||
      stopFlow?.status === "relaxing" ||
      stopFlow?.status === "ready_to_pay"
    ) {
      setDrawer("constraint");
      return;
    }
    if (faintPhase != null || isTravellingToHospital || hospitalStay != null) {
      setDrawer("hospital");
      return;
    }
    // Mandatory checkpoint (quiz / task): do not start travel until Status is resolved (pass, fail, or Continue after correct).
    if (arrivedForChallenge || isAtCurrentWaypoint) {
      setDrawer("status");
      return;
    }
    // Fast restore check in case user taps Travel before async restore effect completes.
    if (typeof window !== "undefined" && activeHuntId) {
      try {
        const rawConstraint = window.sessionStorage.getItem(CONSTRAINT_PENDING_KEY);
        if (rawConstraint) {
          const data = JSON.parse(rawConstraint) as { huntId?: string; status?: string };
          if (
            data?.huntId === activeHuntId &&
            (data?.status === "to_stop" || data?.status === "relaxing" || data?.status === "ready_to_pay")
          ) {
            setDrawer("constraint");
            return;
          }
        }
        const rawHospital = window.sessionStorage.getItem(HOSPITAL_PENDING_KEY);
        if (rawHospital) {
          const data = JSON.parse(rawHospital) as { huntId?: string };
          if (data?.huntId === activeHuntId) {
            setDrawer("hospital");
            return;
          }
        }
      } catch {
        // ignore storage parse issues
      }
    }
    // When already traveling, destination is set and pendingDestination may be null; allow switching mode to same destination.
    const target = pendingDestination ?? destination;
    const targetLabel = pendingDestinationLabel || destinationLabel;
    if (!playerPos || !target) return;
    const offer = travelOffers.find((o) => o.modeId === modeId);
    if (!offer) return;
    if (offer.modeId === "plane") return;

    travelActionLockRef.current = true;
    setTravelActionLoading(modeId); // Show "Renting…" / loading immediately so button can't be clicked again
    try {
      // Compute total payable, but defer debit until route/prep is ready to commit.
      const rentCost = offer.rentCost ?? 0;
      const busFare = modeId === "bus" ? (offer.farePerRide ?? 0) : 0;
      const totalCost = Math.max(0, rentCost + busFare);

      // When already moving (e.g. walking), capture exact interpolated position before stopping, then stop travel.
      // This ensures we continue from the current spot, not snap back to a checkpoint/route start.
      let currentPos = playerPos;
      if (isTraveling && travelRef.current) {
        const tr = travelRef.current;
        const now = Date.now();
        const durationMs = Math.max(1, tr.durationMs);
        const pAnim = Math.min(1, (now - tr.startedAt) / durationMs);
        const targetKm = tr.totalKm * pAnim;
        let i = 1;
        while (i < tr.cumKm.length && tr.cumKm[i] < targetKm) i++;
        i = Math.min(Math.max(i, 1), tr.cumKm.length - 1);
        const prevKm = tr.cumKm[i - 1];
        const segKm = tr.cumKm[i] - prevKm || 1e-9;
        const localT = Math.max(0, Math.min(1, (targetKm - prevKm) / segKm));
        const a = tr.coords[i - 1];
        const b = tr.coords[i];
        currentPos = {
          lng: a[0] + (b[0] - a[0]) * localT,
          lat: a[1] + (b[1] - a[1]) * localT,
        };
        setPlayerPos(currentPos);
        travelRef.current = null;
        setIsTraveling(false);
        setRouteCoords([]);
      } else if (isTraveling) {
        travelRef.current = null;
        setIsTraveling(false);
        setRouteCoords([]);
      }

    // For bus: route only to a terminus ~1km from the quiz (below). Don't seed `base` from Travel ETAs — those go to the full quiz.
    let actualDestination = target;
    let finalDestination: LngLat | undefined = undefined;
    let base = modeId === "bus" ? undefined : modeRoute(modeId);
    const posForRoute = currentPos ?? playerPos;

    if (modeId === "bus") {
      // Bus never terminates at the quiz waypoint: always at least ~1km away; user walks the rest.
      finalDestination = target;
      const dropOff = computeBusDropOff1kmFromQuiz(target, posForRoute);
      let busTerminus: LngLat = dropOff;
      try {
        const osmNearDropOff = await findNearestBusStop(dropOff);
        if (
          osmNearDropOff &&
          haversineKm(osmNearDropOff, target) >= MIN_BUS_TERMINUS_DISTANCE_FROM_QUIZ_KM
        ) {
          busTerminus = osmNearDropOff;
        }
      } catch {
        /* keep geometric dropOff */
      }
      actualDestination = busTerminus;
      try {
        const busStopRoute = await getDrivingDirectionsWithTraffic(posForRoute, actualDestination);
        if (busStopRoute.coords.length >= 2) {
          base = {
            coords: busStopRoute.coords,
            durationSeconds: busStopRoute.durationSeconds,
            distanceMeters: busStopRoute.distanceMeters,
          };
        }
      } catch {
        /* fall through to plain driving */
      }
      if (!base?.coords?.length) {
        try {
          const busStopRoute = await getDirections(posForRoute, actualDestination, "driving");
          if (busStopRoute?.coords?.length) base = busStopRoute;
        } catch {
          /* handled below */
        }
      }
    }

    // When traveling, baseDirs weren't refreshed; get a fresh route from current position for non-bus modes.
    if ((isTraveling && modeId !== "bus") || !base?.coords?.length) {
      try {
        let fresh:
          | {
              coords: Array<[number, number]>;
              durationSeconds: number;
              distanceMeters: number;
            }
          | undefined;
        if (modeId === "car" || modeId === "motorbike") {
          try {
            const t = await getDrivingDirectionsWithTraffic(posForRoute, actualDestination);
            if (t.coords.length >= 2) {
              const useAlt =
                drivingRouteChoice === "alternate" &&
                t.alternate?.coords &&
                t.alternate.coords.length >= 2;
              fresh = useAlt
                ? {
                    coords: t.alternate!.coords,
                    durationSeconds: t.alternate!.durationSeconds,
                    distanceMeters: t.alternate!.distanceMeters,
                  }
                : {
                    coords: t.coords,
                    durationSeconds: t.durationSeconds,
                    distanceMeters: t.distanceMeters,
                  };
            } else {
              fresh = await getDirections(posForRoute, actualDestination, "driving");
            }
          } catch {
            fresh = await getDirections(posForRoute, actualDestination, "driving");
          }
        } else {
          fresh = await getDirections(posForRoute, actualDestination, profileForMode(modeId));
        }
        if (fresh?.coords?.length) base = fresh;
      } catch {
        // Directions API can fail; for walk always allow movement via straight-line fallback
        if (modeId === "walk") {
          const fallbackCoords: Array<[number, number]> = [
            [posForRoute.lng, posForRoute.lat],
            [actualDestination.lng, actualDestination.lat],
          ];
          const distKm = haversineKm(posForRoute, actualDestination);
          const walkSpeedKmh = 5;
          const durationSeconds = Math.max(60, Math.round((distKm / walkSpeedKmh) * 3600));
          base = {
            coords: fallbackCoords,
            durationSeconds,
            distanceMeters: distKm * 1000,
          };
        }
      }
    }

    if (!base?.coords?.length) {
      setToast({ title: "Route unavailable", message: "Could not start travel. You were not charged." });
      return;
    }

    setTravelModeId(modeId);
    setDrawer(null);
    // Keep pendingDestination and pendingDestinationLabel so the Travel drawer and HUD still show the correct target when reopened; they are cleared on arrival.

    // When switching modes mid-travel: trim route to start from current position so avatar continues forward, not back to route start.
    let coordsToUse = base.coords;
    let moveEtaSeconds: number;
    if (isTraveling && base.coords.length >= 2) {
      const to: LngLat = {
        lng: base.coords[base.coords.length - 1]![0],
        lat: base.coords[base.coords.length - 1]![1],
      };
      let closestIdx = 0;
      let closestD = Infinity;
      for (let i = 0; i < base.coords.length; i++) {
        const d = haversineKm(posForRoute, { lng: base.coords[i]![0], lat: base.coords[i]![1] });
        if (d < closestD) {
          closestD = d;
          closestIdx = i;
        }
      }
      coordsToUse =
        closestIdx >= base.coords.length - 1
          ? ([[posForRoute.lng, posForRoute.lat], [to.lng, to.lat]] as Array<[number, number]>)
          : ([[posForRoute.lng, posForRoute.lat], ...base.coords.slice(closestIdx + 1)] as Array<[number, number]>);
      let remainingKm = 0;
      for (let i = 1; i < coordsToUse.length; i++) {
        remainingKm += haversineKm(
          { lng: coordsToUse[i - 1]![0], lat: coordsToUse[i - 1]![1] },
          { lng: coordsToUse[i]![0], lat: coordsToUse[i]![1] },
        );
      }
      const speedKmh = modeId === "walk" ? 5 : (TRAVEL_MODES.find((m) => m.id === modeId)?.speedKmh ?? DEMO_TRAVEL_SPEED_KMH);
      moveEtaSeconds = Math.max(1, Math.round((remainingKm / speedKmh) * 3600));
    } else {
    const baseEta = base.durationSeconds;
      moveEtaSeconds =
      offer.etaSeconds != null && Number.isFinite(offer.etaSeconds)
        ? Math.max(1, Math.round(offer.etaSeconds))
        : Number.isFinite(baseEta)
          ? baseEta
          : 0;
    }

    // Debit only when we are certain we can start prep/travel.
    if (totalCost > 0) {
      if (credits < totalCost) {
        setPayError(
          modeId === "bus"
            ? "Not enough coins to rent and board bus. Buy coins to continue."
            : "Not enough coins to rent. Buy coins to continue."
        );
        openDrawer("coins");
        return;
      }
      const newBal = await deductCredits(totalCost);
      if (newBal === null) {
        setToast({ title: "Payment failed", message: "Could not complete payment. Travel did not start." });
        return;
      }
    }

    const prepSeconds = offer.prepSeconds ?? 0;
    if (prepSeconds > 0) {
      const coordsForPrep = coordsToUse;
      prepPlanRef.current = {
        modeId,
        to: actualDestination,
        finalDestination,
        label: targetLabel,
        coords: coordsForPrep,
        etaSeconds: moveEtaSeconds,
        walkDuringPrep: modeId === "bicycle" || modeId === "motorbike",
      };
      if (prepPlanRef.current.walkDuringPrep) {
        // Walk along the chosen route while waiting (pickup). Use PREP_WALK_SPEEDUP so it feels faster.
        const cumKm: number[] = [0];
        let totalKm = 0;
        for (let i = 1; i < coordsForPrep.length; i++) {
          const a = coordsForPrep[i - 1];
          const b = coordsForPrep[i];
          totalKm += haversineKm(
            { lng: a[0], lat: a[1] },
            { lng: b[0], lat: b[1] },
          );
          cumKm.push(totalKm);
        }
        const prepWalkRealMs = Math.max(2000, (prepSeconds * 1000) / PREP_WALK_SPEEDUP);
        prepWalkRef.current = {
          coords: coordsForPrep,
          cumKm,
          totalKm,
          startedAt: Date.now(),
          durationMs: prepWalkRealMs,
        };
      } else {
        prepWalkRef.current = null;
      }
      if (modeId === "bus") {
        // Two-stage bus prep (sped up by PREP_WALK_SPEEDUP):
        // 1) walk to bus stop (5m in-world → 1 min real)
        // 2) bus arrives (2m in-world → 24s real)
        prepPlanRef.current.walkDuringPrep = true;

        const busWalkRealMs = Math.max(2000, (5 * 60 * 1000) / PREP_WALK_SPEEDUP);
        const cumKm: number[] = [0];
        let totalKm = 0;
        for (let i = 1; i < coordsForPrep.length; i++) {
          const a = coordsForPrep[i - 1];
          const b = coordsForPrep[i];
          totalKm += haversineKm({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
          cumKm.push(totalKm);
        }
        prepWalkRef.current = {
          coords: coordsForPrep,
          cumKm,
          totalKm,
          startedAt: Date.now(),
          durationMs: busWalkRealMs,
        };

        setPrep({
          modeId,
          stage: "bus_walk",
          label: "Walk to bus stop",
          startedAt: Date.now(),
          totalMs: busWalkRealMs,
        });
      } else {
        const prepRealMs = Math.max(2000, (prepSeconds * 1000) / PREP_WALK_SPEEDUP);
        setPrep({
          modeId,
          stage: "single",
          label: offer.prepLabel || "Preparing…",
          startedAt: Date.now(),
          totalMs: prepRealMs,
        });
      }
      return;
    }

      startTravelWithRoute(posForRoute, actualDestination, coordsToUse, modeId, moveEtaSeconds, finalDestination);
    } finally {
      travelActionLockRef.current = false;
      setTravelActionLoading(null);
    }
  }

  // Handle pre-travel delays (uber/pickup/bus) before starting movement
  useEffect(() => {
    if (!prep) return;
    setClock(Date.now());
    const tick = window.setInterval(() => setClock(Date.now()), 400);
    const t = window.setInterval(() => {
      const elapsed = Date.now() - prep.startedAt;
      const plan = prepPlanRef.current;

      // If the delay is "walk to pickup/bus stop", keep the avatar walking during the countdown.
      // Use PREP_WALK_SPEEDUP so in-world distance is covered faster in real time.
      if (plan?.walkDuringPrep && prepWalkRef.current) {
        const w = prepWalkRef.current;
        const walkSpeedKmPerMs = (5 * PREP_WALK_SPEEDUP) / (60 * 60 * 1000); // 5 km/h × speedup
        const targetKm = Math.min(w.totalKm, elapsed * walkSpeedKmPerMs);
        let i = 1;
        while (i < w.cumKm.length && w.cumKm[i] < targetKm) i++;
        i = clamp(i, 1, w.cumKm.length - 1);
        const prevKm = w.cumKm[i - 1];
        const segKm = w.cumKm[i] - prevKm || 1e-9;
        const localT = clamp((targetKm - prevKm) / segKm, 0, 1);
        const a = w.coords[i - 1];
        const b = w.coords[i];
        const nextPos = {
          lng: a[0] + (b[0] - a[0]) * localT,
          lat: a[1] + (b[1] - a[1]) * localT,
        };
        prepWalkLastPosRef.current = nextPos;
        // Update marker directly for smooth movement (avoids React batching delay)
        youMarkerRef.current?.setLngLat?.([nextPos.lng, nextPos.lat]);
        setPlayerPos(nextPos);
      }

      // If we're waiting for a vehicle to arrive (bus / uber), animate it approaching the player.
      if (
        plan &&
        !plan.walkDuringPrep &&
        playerPos &&
        (plan.modeId === "bus" || plan.modeId === "car")
      ) {
        const map = mapRef.current;
        const mapboxgl = mapboxRef.current;
        if (map && mapReady && mapboxgl?.Marker) {
          const Marker = mapboxgl.Marker;
          const coords = plan.coords || [];
          const end = [playerPos.lng, playerPos.lat];
          // Bus: arrive from opposite direction to destination route (bus comes from behind the stop).
          // Car: arrive from along the route (same as before).
          let start: [number, number];
          if (plan.modeId === "bus" && plan.finalDestination) {
            const dest = plan.finalDestination;
            const dx = dest.lng - playerPos.lng;
            const dy = dest.lat - playerPos.lat;
            const norm = Math.sqrt(dx * dx + dy * dy) || 1e-9;
            const scale = Math.min(0.02 / norm, 100); // ~2km away in opposite direction, capped for nearby dest
            start = [
              playerPos.lng - dx * scale,
              playerPos.lat - dy * scale,
            ];
          } else {
            const startIdx = coords.length >= 2 ? Math.min(8, coords.length - 1) : 0;
            start = coords[startIdx] || [playerPos.lng - 0.01, playerPos.lat - 0.006];
          }
          const p = clamp(elapsed / prep.totalMs, 0, 1);
          const lng = start[0] + (end[0] - start[0]) * p;
          const lat = start[1] + (end[1] - start[1]) * p;

          const kind = plan.modeId;
          if (!pickupMarkerRef.current || pickupMarkerModeRef.current !== kind) {
            try {
              pickupMarkerRef.current?.remove?.();
            } catch {}
            const busColor = "#EAB308";
            const el = makePickupVehicleEl(
              kind === "bus" ? "directions_bus" : "local_taxi",
              kind === "bus" ? busColor : undefined,
            );
            pickupMarkerRef.current = new Marker({ element: el })
              .setLngLat([lng, lat])
              .addTo(map);
            pickupMarkerModeRef.current = kind;
          } else {
            pickupMarkerRef.current.setLngLat([lng, lat]);
          }
        }
      } else {
        if (pickupMarkerRef.current) {
          try {
            pickupMarkerRef.current.remove?.();
          } catch {}
          pickupMarkerRef.current = null;
          pickupMarkerModeRef.current = null;
        }
      }

      if (elapsed < prep.totalMs) return;
      window.clearInterval(t);
      window.clearInterval(tick);
      if (pickupMarkerRef.current) {
        try {
          pickupMarkerRef.current.remove?.();
        } catch {}
        pickupMarkerRef.current = null;
        pickupMarkerModeRef.current = null;
      }
      const cur = prepWalkLastPosRef.current ?? playerPos;
      if (!plan || !cur) {
        prepPlanRef.current = null;
        setPrep(null);
        return;
      }

      // Bus: after walking to bus stop, do a short arrival wait phase (sped up).
      if (plan.modeId === "bus" && prep.stage === "bus_walk") {
        prepWalkRef.current = null;
        plan.walkDuringPrep = false;
        setPrep({
          modeId: "bus",
          stage: "bus_wait",
          label: "Bus arriving",
          startedAt: Date.now(),
          totalMs: Math.max(3000, (2 * 60 * 1000) / PREP_WALK_SPEEDUP),
        });
        return;
      }

      // End of any prep phase (including bus_wait)
      prepPlanRef.current = null;
      setPrep(null);

      // For walking-during-prep, start the main travel from the current walked-to point.
      if (plan.walkDuringPrep && prepWalkRef.current) {
        const w = prepWalkRef.current;
        prepWalkRef.current = null;
        prepWalkLastPosRef.current = null;
        // Start from current position and use the remaining part of the base route.
        let bestIdx = 0;
        let bestD = Infinity;
        for (let i = 0; i < w.coords.length; i++) {
          const c = w.coords[i];
          const dKm = haversineKm(cur, { lng: c[0], lat: c[1] });
          if (dKm < bestD) {
            bestD = dKm;
            bestIdx = i;
          }
        }
        const remaining = [ [cur.lng, cur.lat] as [number, number], ...w.coords.slice(bestIdx) ];
        startTravelWithRoute(cur, plan.to, remaining, plan.modeId, plan.etaSeconds, plan.finalDestination);
        return;
      }

      prepWalkRef.current = null;
      prepWalkLastPosRef.current = null;
      if (cur) {
        startTravelWithRoute(cur, plan.to, plan.coords, plan.modeId, plan.etaSeconds, plan.finalDestination);
      }
    }, 50); // 50ms (~20fps) for smooth prep walk; 250ms was choppy and caused visible glitches
    return () => {
      window.clearInterval(t);
      window.clearInterval(tick);
      if (pickupMarkerRef.current) {
        try {
          pickupMarkerRef.current.remove?.();
        } catch {}
        pickupMarkerRef.current = null;
        pickupMarkerModeRef.current = null;
      }
    };
  }, [prep, mapReady]);

  // Stop action progress (relax/refuel/rejuvenate). Runs in-world seconds but accelerated by STOP_SPEEDUP.
  useEffect(() => {
    if (!stopFlow) return;
    if (stopFlow.status !== "relaxing") return;
    const tick = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [stopFlow]);

  useEffect(() => {
    if (!stopFlow) return;
    if (stopFlow.status !== "relaxing") return;
    if (!stopFlow.startedAt) return;
    const speedup = stopFlow.restInPlace ? STOP_SPEEDUP_REST_IN_PLACE : STOP_SPEEDUP;
    const realTotalMs = Math.max(
      1000,
      Math.round((stopFlow.actionSeconds * 1000) / speedup),
    );
    const elapsed = Date.now() - stopFlow.startedAt;
    if (elapsed < realTotalMs) return;
    setStopFlow((s) => (s ? { ...s, status: "ready_to_pay" } : s));
  }, [clock, stopFlow]);

  // Derived HUD values
  const hudCoordLabel = playerPos ? `${fmtCoord(playerPos.lat)}, ${fmtCoord(playerPos.lng)}` : "—";
  const hudWalkDuringPrep = Boolean(prepPlanRef.current?.walkDuringPrep);
  const hudPrepSecondsLeft = prep
    ? Math.max(0, Math.ceil((prep.totalMs - Math.max(0, clock - prep.startedAt)) / 1000))
    : 0;
  // Use yourCurrentModeId so HUD shows actual mode when traveling (travelRef.current?.modeId), not stale travelModeId
  const hudDisplayMode = TRAVEL_MODES.find((m) => m.id === yourCurrentModeId) ?? TRAVEL_MODES[0];
  const hudModeIconName =
    prep && hudWalkDuringPrep
      ? "directions_walk"
      : faintPhase || isTravellingToHospital
        ? "local_hospital"
        : arrivedForChallenge && !isTraveling
          ? "quiz"
          : yourCurrentModeId === "walk"
            ? "directions_walk"
            : hudDisplayMode.icon;
  const hudModeLabel = prep
    ? prep.label
    : faintPhase || isTravellingToHospital
      ? "Ambulance"
      : arrivedForChallenge && !isTraveling
        ? "Answer quiz"
        : yourCurrentModeId === "walk"
          ? "Walking"
          : hudDisplayMode.label;
  const hudPrepLabel = (() => {
    if (!prep) return "";
    let label = prep.label || "";
    if (hudWalkDuringPrep) {
      const source = label.toLowerCase();
      if (source.includes("bus stop")) {
        label = "Walking to bus stop";
      } else {
        label = "Walking to rent store";
      }
    }
    const MAX_PREP_LABEL = 24;
    if (label.length > MAX_PREP_LABEL) return `${label.slice(0, MAX_PREP_LABEL - 3)}...`;
    return label;
  })();
  const hudTripKm = travelRef.current?.totalKm;
  const hudTripKmLabel =
    typeof hudTripKm === "number" && Number.isFinite(hudTripKm)
      ? hudTripKm >= 100
        ? `${Math.round(hudTripKm)}km`
        : hudTripKm >= 10
          ? `${hudTripKm.toFixed(1)}km`
          : `${hudTripKm.toFixed(2)}km`
      : "";
  const hudTravelPct = Math.round(progress * 100);

  // Plane: show "waiting at airport" on screen when boarding, disembarking, or flying (so user sees progress without opening drawer)
  const planeWaitStage = planeFlow?.stage;
  const hudPlaneWaitLabel =
    planeWaitStage === "boarding"
      ? "Waiting at departure"
      : planeWaitStage === "disembarking"
        ? "Waiting at arrival"
        : planeWaitStage === "flying"
          ? "Flying"
          : undefined;
  const hudPlaneWaitCountdownSec =
    planeWaitStage === "boarding" && planeFlow?.boardingStartedAt != null
      ? Math.max(0, Math.ceil((PLANE_BOARDING_MINUTES * 60 * 1000 - (clock - planeFlow.boardingStartedAt)) / 1000))
      : planeWaitStage === "disembarking" && planeFlow?.disembarkingEndsAt != null
        ? Math.max(0, Math.ceil((planeFlow.disembarkingEndsAt - clock) / 1000))
        : null;
  const hudPlaneWaitTotalSec =
    planeWaitStage === "boarding"
      ? PLANE_BOARDING_MINUTES * 60
      : planeWaitStage === "disembarking"
        ? PLANE_DISEMBARKING_MINUTES * 60
        : null;
  const hudPlaneWaitProgressPct = planeWaitStage === "flying" ? hudTravelPct : null;

  const recenterHuntsMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    let lng: number | undefined;
    let lat: number | undefined;
    const marker = youMarkerRef.current as { getLngLat?: () => { lng: number; lat: number } } | null;
    if (marker && typeof marker.getLngLat === "function") {
      const ll = marker.getLngLat();
      lng = ll.lng;
      lat = ll.lat;
    } else if (playerPos) {
      lng = playerPos.lng;
      lat = playerPos.lat;
    }
    if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return;

    huntsRouteExplorePauseAtRef.current = 0;
    huntsTravelCameraLastMoveAtRef.current = 0;
    lastCameraEaseAtRef.current = 0;

    const isPlane = Boolean(
      isTraveling && !isTravellingToHospital && travelRef.current?.modeId === "plane",
    );
    const zoom = isPlane ? 6.8 : 14;

    try {
      if (typeof (map as { stop?: () => void }).stop === "function") {
        (map as { stop: () => void }).stop();
      }
    } catch {
      /* ignore */
    }
    try {
      map.easeTo({
        center: [lng, lat] as [number, number],
        zoom,
        duration: 600,
        bearing: 0,
        pitch: 0,
      });
    } catch {
      try {
        map.jumpTo({ center: [lng, lat], zoom, bearing: 0, pitch: 0 });
      } catch {
        /* ignore */
      }
    }
    lastCameraEaseAtRef.current = Date.now();
  }, [playerPos, isTraveling, isTravellingToHospital]);

  // No active hunt: show message and redirect to lobby (avoid showing destination/keys)
  if (huntFetchDone && !activeHuntId) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-white">
          <AppHeaderWithAuth variant="overlay" active="hunts" tokens="0" tokensIcon="groups" />
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md space-y-6">
              <p className="text-lg font-bold text-slate-800">No active hunt</p>
              <p className="text-sm text-slate-600">
                There isn&apos;t a hunt running right now. Join the lobby to see when the next one starts and register.
              </p>
              <Link
                href="/lobby"
                className="inline-block px-6 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-wide hover:bg-[#2563EB] transition-colors"
              >
                Go to Lobby
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="h-screen h-[100dvh] max-h-[100dvh] w-screen overflow-hidden bg-white relative">
      {/* Multi-device: only one tab/device can control the avatar */}
      {otherDeviceRole ? (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 p-6">
          <div className="max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
            {otherDeviceRole === "secondary" ? (
              <>
                <p className="text-sm font-bold text-slate-800">You are travelling already</p>
                <p className="mt-2 text-sm text-slate-600">
                  You're already on the move in another tab or device. Use that one to continue.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-800">Close the other device</p>
                <p className="mt-2 text-sm text-slate-600">
                  Another tab or device has this hunt open. Close it to continue travelling here.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
      {/* Map in portal to body so it always fills the viewport (no parent transform/layout can shrink it) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-10 hunts-map-viewport"
            style={{
              width: "100vw",
              height: "100dvh",
              minHeight: "100vh",
              maxHeight: "100dvh",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {!tokenPresent ? (
              <div className="h-full w-full flex items-center justify-center p-10 text-center">
                <div className="max-w-lg">
                  <p className="text-lg font-extrabold">Map token missing</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Add <span className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</span> to enable the map.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="absolute inset-0">
                  <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
                </div>
                {mapReady ? (
                  <button
                    type="button"
                    onClick={recenterHuntsMap}
                    title="Recenter on your position"
                    aria-label="Recenter map on your current position"
                    className="absolute bottom-24 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white/95 text-[#0F172A] shadow-md backdrop-blur-sm transition hover:bg-slate-50 active:scale-[0.97]"
                  >
                    <span className="material-symbols-outlined text-[26px]">my_location</span>
                  </button>
                ) : null}
              </>
            )}

            {/* Before hunt start: show countdown and message; map and avatars remain visible */}
            <HuntsCountdownOverlay
              show={Boolean(isRegisteredForHunt && !huntHasStarted && secondsUntilStart != null)}
              secondsUntilStart={secondsUntilStart ?? 0}
            />
          </div>,
          document.body
        )}

      <AppHeaderWithAuth
        variant="overlay"
        active="hunts"
        tokens={huntersHunting.toLocaleString()}
        tokensIcon="groups"
        onMapClick={() => {
          if (isUserCompletedHunt) return;
          if (!huntHasStarted) {
            setDrawer("status");
            return;
          }
          // At current (target) waypoint or pending checkpoint challenge: open status so the quiz is visible.
          if (isAtCurrentWaypoint || arrivedForChallenge) {
            setDrawer("status");
            return;
          }
          planeFlow
            ? planeFlow.stage === "to_departure"
              ? setDrawer("travel")
              : setDrawer("plane")
            : pendingDestination
              ? setDrawer("travel")
              : huntPhase === "public_trip"
                ? setDrawer("travel")
                : huntPhase === "hunt"
                  ? openDrawer("destination")
                  : setDrawer("status");
        }}
      />

      <HuntsNavButtons
        activeDrawer={
          drawer === "status"
            ? "status"
            : drawer === "travel" || drawer === "destination" || drawer === "plane"
              ? "travel"
              : drawer === "inventory" || drawer === "coins"
                ? "inventory"
                : drawer === "garage" || drawer === "breakdown"
                  ? "garage"
                  : drawer === "leaderboard"
                    ? "leaderboard"
                    : null
        }
        travelDisabled={
          isAtCurrentWaypoint ||
          arrivedForChallenge ||
          Boolean(faintPhase || isTravellingToHospital || hospitalStay)
        }
        onOpenTravel={() => {
          if (isUserCompletedHunt) return;
          if (!huntHasStarted) {
            setDrawer("status");
            return;
          }
          // When hospital flow is active (ambulance, en route, or recovering), open hospital drawer instead of travel.
          if (faintPhase || isTravellingToHospital || hospitalStay) {
            setDrawer("hospital");
            return;
          }
          // Mandatory checkpoint: travel is disabled until quiz/task is resolved — open status instead.
          if (isAtCurrentWaypoint || arrivedForChallenge) {
            setDrawer("status");
            return;
          }
          // Travel modal is only for starting a trip or changing travel mode — open it when user taps Travel.
          if (pendingDestination || destination) {
            setDrawer("travel");
          } else if (huntPhase === "public_trip" && publicLocation) {
            setPendingDestination(publicLocation);
            setPendingDestinationLabel("Next checkpoint");
            setDrawer("travel");
          } else {
            setDrawer("travel");
          }
        }}
        onOpenInventory={() => {
          if (!huntHasStarted) {
            setDrawer("status");
            return;
          }
          openDrawer("inventory");
        }}
        onOpenGarage={() => {
          if (!huntHasStarted) {
            setDrawer("status");
            return;
          }
          setDrawer("garage");
        }}
        onOpenLeaderboard={() => setDrawer("leaderboard")}
        onOpenStatus={() => {
          if (isUserCompletedHunt) return;
          setDrawer("status");
        }}
        notifications={{
          travel: navNotifications.travel,
          inventory: navNotifications.inventory,
          garage: navNotifications.garage,
          leaderboard: navNotifications.leaderboard,
          status: navNotifications.status,
        }}
      />

      <HuntsToast toast={toast} />

      {isUserCompletedHunt ? (
        <div className="fixed inset-0 z-[115] pointer-events-none flex items-center justify-center p-6">
          {completionConfettiVisible ? (
            <div className="pointer-events-none fixed inset-0 z-[116] overflow-hidden" aria-hidden>
              {Array.from({ length: 120 }, (_, i) => i).map((i) => {
                const leftPct = (i * 37) % 100;
                const delay = (i % 24) * 0.1;
                const duration = 2.8 + (i % 7) * 0.35;
                const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#a855f7"];
                return (
                  <span
                    key={i}
                    className="absolute top-[-18px] block h-3 w-2 rounded-sm completion-confetti-fall"
                    style={{
                      left: `${leftPct}%`,
                      backgroundColor: colors[i % colors.length],
                      animationDelay: `${delay}s`,
                      animationDuration: `${duration}s`,
                    }}
                  />
                );
              })}
              <style jsx>{`
                .completion-confetti-fall {
                  opacity: 0.95;
                  animation-name: completion-confetti-fall;
                  animation-timing-function: linear;
                  animation-iteration-count: infinite;
                }
                @keyframes completion-confetti-fall {
                  0% {
                    transform: translateY(-10px) rotate(0deg);
                    opacity: 0;
                  }
                  12% {
                    opacity: 1;
                  }
                  100% {
                    transform: translateY(115vh) rotate(720deg);
                    opacity: 0.85;
                  }
                }
              `}</style>
            </div>
          ) : null}
          <div className="pointer-events-auto w-full max-w-lg rounded-3xl border border-[#F1F5F9] bg-white/95 backdrop-blur-md soft-shadow p-7 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Hunt completed
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#0F172A]">
              {completionResult?.isWinner === false ? "You completed the hunt." : "You won the hunt."}
            </h2>
            {completionResult?.placement ? (
              <p className="mt-4 text-6xl leading-none font-black text-[#0F172A] tabular-nums">
                {completionResult.placement}
                <span className="text-xl align-top ml-1">{ordinal(completionResult.placement)}</span>
              </p>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">
              {completionResult?.placement
                ? completionResult?.isWinner === false
                  ? `You came ${ordinal(completionResult.placement)}.`
                  : `You came ${ordinal(completionResult.placement)} and are within the winner slots.`
                : "Your completion has been recorded."}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Participate in coming hunts.
            </p>
          </div>
        </div>
      ) : null}

      {/* When traveling to relax/refuel/hospital, progress is shown in the gateway card instead of a separate HUD */}
      <HuntsTravelHud
        visible={
          Boolean(prep || isTraveling || hudPlaneWaitLabel || arrivedForChallenge) &&
          !(stopFlow != null && isTraveling && drawer !== "constraint" && drawer !== "hospital") &&
          !(faintPhase || isTravellingToHospital || hospitalStay)
        }
        hasPrep={Boolean(prep)}
        isTraveling={isTraveling}
        prepLabel={hudPrepLabel}
        coordLabel={hudCoordLabel}
        locationApproximate={locationIsApproximate}
        prepSecondsLeft={hudPrepSecondsLeft}
        modeIconName={hudModeIconName}
        modeLabel={hudModeLabel}
        tripKmLabel={hudTripKmLabel}
        travelPct={hudTravelPct}
        planeWaitLabel={hudPlaneWaitLabel}
        planeWaitCountdownSec={hudPlaneWaitCountdownSec}
        planeWaitTotalSec={hudPlaneWaitTotalSec}
        planeWaitProgressPct={hudPlaneWaitProgressPct}
      />

      <HuntsBottomHud huntHasStarted={huntHasStarted} destinationLabel={destinationLabel} keys={keys} keysToWin={keysToWin} />

      {/* Continue: when user reloaded/navigated away during travel, let them resume with same mode */}
      {resumableTravel &&
        !isTraveling &&
        !stopFlow &&
        !hospitalStay &&
        !faintPhase &&
        !isTravellingToHospital &&
        !travelPause?.kind &&
        playerPos && (
          <div className="fixed bottom-4 right-4 z-50 flex">
            <button
              type="button"
              onClick={async () => {
                if (!resumableTravel || !playerPos) return;
                const { routeCoords, durationMs, modeId } = resumableTravel;
                const to: LngLat = {
                  lng: routeCoords[routeCoords.length - 1]![0],
                  lat: routeCoords[routeCoords.length - 1]![1],
                };
                let closestIdx = 0;
                let closestD = Infinity;
                for (let i = 0; i < routeCoords.length; i++) {
                  const d = haversineKm(playerPos, { lng: routeCoords[i]![0], lat: routeCoords[i]![1] });
                  if (d < closestD) {
                    closestD = d;
                    closestIdx = i;
                  }
                }
                const remainingCoords: Array<[number, number]> =
                  closestIdx >= routeCoords.length - 1
                    ? [[playerPos.lng, playerPos.lat], [to.lng, to.lat]]
                    : [[playerPos.lng, playerPos.lat], ...routeCoords.slice(closestIdx + 1)];
                let remainingKm = 0;
                for (let i = 1; i < remainingCoords.length; i++) {
                  remainingKm += haversineKm(
                    { lng: remainingCoords[i - 1]![0], lat: remainingCoords[i - 1]![1] },
                    { lng: remainingCoords[i]![0], lat: remainingCoords[i]![1] },
                  );
                }
                const speedKmh = modeId === "walk" ? 5 : (TRAVEL_MODES.find((m) => m.id === modeId)?.speedKmh ?? DEMO_TRAVEL_SPEED_KMH);
                const remainingEtaSeconds = Math.max(60, Math.round((remainingKm / speedKmh) * 3600));
                setResumableTravel(null);
                setPendingDestination(to);
                setPendingDestinationLabel(destinationLabel || "Destination");
                setDestinationLabelSafe(destinationLabel || "Destination");
                startTravelWithRoute(playerPos, to, remainingCoords, modeId, remainingEtaSeconds);
              }}
              className="px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[#F1F5F9] soft-shadow hover:bg-slate-50 active:scale-[0.98] transition-all font-black text-xs uppercase tracking-wider text-[#0F172A] inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              Continue
            </button>
          </div>
        )}

      {/* Gateway: when stop/constraint/hospital is pending but drawer is closed, show a way back in the bottom-right */}
      <HuntsStopGatewayButton
        show={
          (stopFlow != null ||
            travelPause?.kind === "bus_stop" ||
            hospitalStay != null ||
            isTravellingToHospital ||
            faintPhase != null) &&
          drawer !== "constraint" &&
          drawer !== "hospital"
        }
        isHospital={faintPhase != null || hospitalStay != null || isTravellingToHospital}
        stopKind={stopFlow?.kind ?? null}
        countdownSec={
          faintPhase != null
            ? Math.max(
                0,
                Math.ceil(
                  (faintPhase.startedAt + faintPhase.ambulanceArrivalMs - Date.now()) / 1000,
                ),
              )
            : hospitalStay != null
              ? Math.max(
                  0,
                  Math.ceil(
                    (hospitalStay.durationMs - (Date.now() - hospitalStay.startedAt)) / 1000,
                  ),
                )
              : isTravellingToHospital
            ? null
            : travelPause?.kind === "bus_stop"
              ? Math.max(
                  0,
                  Math.ceil(
                    (Math.max(1000, travelPause.totalMs) - Math.max(0, Date.now() - travelPause.startedAt)) /
                      1000,
                  ),
                )
              : stopFlow && (stopFlow.status === "relaxing" || stopFlow.status === "ready_to_pay")
                ? (() => {
                    const startedAt = stopFlow.startedAt ?? Date.now();
                    const actionSeconds = stopFlow.actionSeconds ?? 180;
                    const speedup = stopFlow.restInPlace ? STOP_SPEEDUP_REST_IN_PLACE : STOP_SPEEDUP;
                    const elapsedMs = Math.max(0, Date.now() - startedAt);
                    return Math.max(0, Math.ceil(actionSeconds - (elapsedMs * speedup) / 1000));
                  })()
                : null
        }
        travelPct={
          stopFlow != null && isTraveling
            ? hudTravelPct
            : isTravellingToHospital && isTraveling
              ? hudTravelPct
              : null
        }
        travelModeLabel={
          stopFlow != null && isTraveling
            ? hudModeLabel
            : isTravellingToHospital && isTraveling
              ? hudModeLabel
              : null
        }
        travelTripKmLabel={
          stopFlow != null && isTraveling
            ? hudTripKmLabel
            : isTravellingToHospital && isTraveling
              ? hudTripKmLabel
              : null
        }
        travelCoordLabel={
          stopFlow != null && isTraveling
            ? hudCoordLabel
            : isTravellingToHospital && isTraveling
              ? hudCoordLabel
              : null
        }
        travelModeIconName={
          stopFlow != null && isTraveling
            ? hudModeIconName
            : isTravellingToHospital && isTraveling
              ? hudModeIconName
              : null
        }
        actionLabel={
          (stopFlow?.status === "ready_to_pay" || (hospitalStay != null && (hospitalStay.durationMs - (Date.now() - hospitalStay.startedAt)) <= 0))
            ? (hospitalStay != null
                ? (hospitalStay.costCoins > 0 ? `Pay ${formatCoins(hospitalStay.costCoins)}` : "Go")
                : (stopFlow?.costCoins ?? 0) > 0
                  ? `Pay ${formatCoins(stopFlow?.costCoins ?? 0)}`
                  : "Go")
            : null
        }
        onAction={
          stopFlow?.status === "ready_to_pay"
            ? async () => {
                if (!stopFlow || stopFlow.status !== "ready_to_pay") return;
                const cost = stopFlow.costCoins ?? 0;
                if (cost > 0 && credits < cost) {
                  setPayError("Not enough coins. Buy coins to continue.");
                  openDrawer("coins");
                  return;
                }
                setGatewayActionLoading(true);
                try {
                  if (cost > 0) {
                    const newBal = await deductCredits(cost);
                    if (newBal === null) {
                      setGatewayActionLoading(false);
                      return;
                    }
                  }
                  const from = playerPos;
                  if (!from || !stopFlow.resumeCoords?.length || stopFlow.resumeEtaSeconds == null) {
                    setStopFlow(null);
                    setDrawer(null);
                    setGatewayActionLoading(false);
                    return;
                  }
                  arrivalActionRef.current = null;
                  const bonusKm =
                    !stopFlow.restInPlace && (stopFlow.kind === "rejuvenate" || stopFlow.kind === "rest")
                      ? REJUVENATE_KM_BONUS_AFTER_VENUE
                      : undefined;
                  setStopFlow(null);
                  setDrawer(null);
                  startTravelWithRoute(
                    from,
                    stopFlow.finalTo,
                    stopFlow.resumeCoords,
                    stopFlow.modeId,
                    stopFlow.resumeEtaSeconds,
                    undefined,
                    bonusKm,
                  );
                } finally {
                  setGatewayActionLoading(false);
                }
              }
            : hospitalStay != null && (hospitalStay.durationMs - (Date.now() - hospitalStay.startedAt)) <= 0
              ? async () => {
                  if (!hospitalStay) return;
                  const cost = hospitalStay.costCoins;
                  if (credits < cost) {
                    setPayError("Not enough coins for hospital bill. Buy coins to continue.");
                    openDrawer("coins");
                    return;
                  }
                  setGatewayActionLoading(true);
                  try {
                    const newBal = await deductCredits(cost);
                    if (newBal === null) {
                      setGatewayActionLoading(false);
                      return;
                    }
                    const next = huntDestinationAfterHospitalRef.current;
                    huntDestinationAfterHospitalRef.current = null;
                    const bikeFaint = bicycleFaintRef.current;
                    bicycleFaintRef.current = null;
                    setHospitalStay(null);
                    setDrawer(null);
                    if (!next || !playerPos) return;
                    if (bikeFaint) {
                      if (!bikeFaint.wasRental) {
                        setVehicleState((prev: any) => ({
                          ...prev,
                          bicycle: {
                            ...prev.bicycle,
                            status: "repairing",
                            untilMs: Date.now() + BICYCLE_RECOVERY_REPAIR_DURATION_MS,
                          },
                        }));
                      }
                      setPendingDestination(next.to);
                      setPendingDestinationLabel(next.label);
                      setTravelModeId("walk");
                      setDrawer("travel");
                      setToast({
                        title: "Discharged",
                        message: "Your bicycle was left at the scene. Choose how to continue to your destination.",
                      });
                      setGatewayActionLoading(false);
                      return;
                    }
                    try {
                      const prof = profileForMode(next.modeId);
                      const dirs = await getDirections(playerPos, next.to, prof);
                      if (dirs?.coords?.length >= 2) {
                        setTravelModeId(next.modeId);
                        startTravelWithRoute(
                          playerPos,
                          next.to,
                          dirs.coords,
                          next.modeId,
                          dirs.durationSeconds,
                        );
                        setToast({ title: "Discharged", message: "Continuing to your destination." });
                      } else {
                        setPendingDestination(next.to);
                        setPendingDestinationLabel(next.label);
                        setDrawer("travel");
                      }
                    } catch {
                      setPendingDestination(next.to);
                      setPendingDestinationLabel(next.label);
                      setDrawer("travel");
                    }
                  } finally {
                    setGatewayActionLoading(false);
                  }
                }
              : undefined
        }
        actionLoading={gatewayActionLoading}
        onOpen={() =>
          setDrawer(
            faintPhase != null || hospitalStay != null || isTravellingToHospital
              ? "hospital"
              : "constraint",
          )
        }
      />

      <HuntsDrawerShell
        open={!isUserCompletedHunt && Boolean(drawer)}
        title={drawerTitle}
        credits={credits}
        huntersHunting={huntersHunting}
        onClose={closeDrawer}
        closeable={true}
      >
            {drawer === "constraint" && !hospitalStay && !isTravellingToHospital ? (
              <HuntsConstraintDrawerContent
                stopFlow={stopFlow}
                travelPause={travelPause}
                credits={credits}
                playerPos={playerPos}
                formatNaira={formatCoins}
                deductCredits={deductCredits}
                openDrawer={openDrawer}
                closeDrawer={closeDrawer}
                setStopFlow={setStopFlow}
                setDrawer={setDrawer}
                setPayError={setPayError}
                startTravelWithRoute={startTravelWithRoute}
                isTravelingToStop={
                  Boolean(
                    stopFlow?.status === "to_stop" &&
                      stopFlow?.stop &&
                      isTraveling &&
                      destination &&
                      Math.abs(destination.lng - stopFlow.stop.center[0]) < 1e-5 &&
                      Math.abs(destination.lat - stopFlow.stop.center[1]) < 1e-5,
                  )
                }
                onGoToStop={() => {
                  if (anotherDeviceActive) return;
                  if (!stopFlow || stopFlow.status !== "to_stop" || !stopFlow.stop) return;
                  if (activeHuntId && user?.id && supabase) {
                    const playerName = (profile?.username as string) || "Player";
                    supabase
                      .from("hunt_player_actions")
                      .insert({
                        hunt_id: activeHuntId,
                        player_id: user.id,
                        player_name: playerName,
                        action_type: "constraint_choice",
                        payload: { choice: "go_to_stop", kind: stopFlow.kind },
                      })
                      .then((r: { error: unknown }) => {
                        if (r.error) console.warn("[Hunts] constraint_choice go_to_stop error", r.error);
                      });
                  }
                  if (stopFlow.restInPlace) {
                    arrivalActionRef.current?.();
                    return;
                  }
                  if (!stopFlow.coordsToStop?.length) return;
                  startTravelWithRoute(
                    playerPos!,
                    { lng: stopFlow.stop.center[0], lat: stopFlow.stop.center[1] },
                    stopFlow.coordsToStop,
                    stopFlow.modeId,
                    stopFlow.durationSecondsToStop,
                  );
                }}
                onResumeToDestination={() => {
                  arrivalActionRef.current = null;
                }}
                onCancelStop={async (opts) => {
                  if (!stopFlow || stopFlow.status !== "to_stop" || !playerPos) {
                    setStopFlow(null);
                    setDrawer(null);
                    return;
                  }
                  const { finalTo, modeId } = stopFlow;
                  // Drop the detour line to the stop immediately so the map doesn't keep showing it while directions load.
                  setRouteCoords([]);
                  setDestination(null);
                  if (activeHuntId && user?.id && supabase) {
                    const playerName = (profile?.username as string) || "Player";
                    supabase
                      .from("hunt_player_actions")
                      .insert({
                        hunt_id: activeHuntId,
                        player_id: user.id,
                        player_name: playerName,
                        action_type: "constraint_choice",
                        payload: {
                          choice: "keep_going",
                          kind: stopFlow.kind,
                          triggerConsequence: Boolean(opts?.triggerConsequence),
                        },
                      })
                      .then((r: { error: unknown }) => {
                        if (r.error) console.warn("[Hunts] constraint_choice keep_going error", r.error);
                      });
                  }
                  if (opts?.triggerConsequence) {
                    // Refuel: out_of_fuel after 0.5 km. Rejuvenate (walk or bicycle): same as walk — re-prompt after short distance, then faint → hospital.
                    const kind: ConsequenceFlow["kind"] =
                      stopFlow.kind === "refuel"
                        ? "out_of_fuel"
                        : "faint";
                    if (kind === "faint" && stopFlow.isSecondWarning) {
                      consequenceTriggerRef.current = { triggerAfterKm: 0.25, kind, modeId: stopFlow.modeId, stage: "faint" };
                      setFaintDangerActive(true);
                    } else if (kind === "faint") {
                      consequenceTriggerRef.current = { triggerAfterKm: 1.25, kind, modeId: stopFlow.modeId, stage: "second_warning" };
                      setFaintDangerActive(true);
                    } else {
                      consequenceTriggerRef.current = { triggerAfterKm: 0.5, kind, modeId: stopFlow.modeId };
                    }
                    // Close drawer immediately so user can't click "Continue anyway" or "Go back" again.
                    setStopFlow(null);
                    setDrawer(null);
                  }
                  arrivalActionRef.current = null; // so arrival at destination shows quiz, not stop again
                  const prof = profileForMode(modeId);
                  const resumeBonusAfterKeepGoing =
                    opts?.triggerConsequence && (modeId === "walk" || modeId === "bicycle")
                      ? modeId === "walk"
                        ? WALK_REJUVENATE_EVERY_KM
                        : BIKE_REJUVENATE_EVERY_KM
                      : undefined;
                  try {
                    const dirs = await getDirections(playerPos, finalTo, prof);
                    if (dirs?.coords?.length >= 2) {
                      startTravelWithRoute(
                        playerPos,
                        finalTo,
                        dirs.coords,
                        modeId,
                        dirs.durationSeconds,
                        undefined,
                        resumeBonusAfterKeepGoing,
                      );
                    }
                  } catch (_) {
                    // If directions fail, still close; user can plot again from Travel
                  }
                  if (!opts?.triggerConsequence) {
                    setStopFlow(null);
                    setDrawer(null);
                  }
                }}
              />
            ) : null}

            {(drawer === "hospital" || hospitalStay != null || isTravellingToHospital) ? (
              <HuntsHospitalDrawerContent
                faintPhase={faintPhase}
                isTravellingToHospital={isTravellingToHospital}
                hospitalStay={hospitalStay}
                credits={credits}
                formatNaira={formatCoins}
                deductCredits={deductCredits}
                openDrawer={openDrawer}
                setPayError={setPayError}
                setHospitalStay={setHospitalStay}
                setDrawer={setDrawer}
                onAfterPayAndLeave={() => {
                  const next = huntDestinationAfterHospitalRef.current;
                  huntDestinationAfterHospitalRef.current = null;
                  const bikeFaint = bicycleFaintRef.current;
                  bicycleFaintRef.current = null;
                  setHospitalStay(null);
                  setDrawer(null);

                  if (!next || !playerPos) return;

                  // Bicycle was left at the scene (ambulance doesn't take the bike). So they don't have it at the hospital — let them choose how to continue.
                  if (bikeFaint) {
                    if (!bikeFaint.wasRental) {
                      setVehicleState((prev: any) => ({
                        ...prev,
                        bicycle: {
                          ...prev.bicycle,
                          status: "repairing",
                          untilMs: Date.now() + BICYCLE_RECOVERY_REPAIR_DURATION_MS,
                        },
                      }));
                    }
                    setPendingDestination(next.to);
                    setPendingDestinationLabel(next.label);
                    setTravelModeId("walk");
                    setDrawer("travel");
                    setToast({
                      title: "Discharged",
                      message: "Your bicycle was left at the scene. Choose how to continue to your destination.",
                    });
                    return;
                  }

                  void (async () => {
                    try {
                      const prof = profileForMode(next.modeId);
                      const dirs = await getDirections(playerPos, next.to, prof);
                      if (dirs?.coords?.length >= 2) {
                        setTravelModeId(next.modeId);
                        startTravelWithRoute(
                          playerPos,
                          next.to,
                          dirs.coords,
                          next.modeId,
                          dirs.durationSeconds,
                        );
                        setToast({ title: "Discharged", message: "Continuing to your destination." });
                      } else {
                        setPendingDestination(next.to);
                        setPendingDestinationLabel(next.label);
                        setDrawer("travel");
                      }
                    } catch {
                      setPendingDestination(next.to);
                      setPendingDestinationLabel(next.label);
                      setDrawer("travel");
                    }
                  })();
                }}
              />
            ) : null}

            {drawer === "breakdown" ? (
              <HuntsBreakdownDrawerContent
                breakdownFlow={breakdownFlow}
                credits={credits}
                formatNaira={formatCoins}
                deductCredits={deductCredits}
                openDrawer={openDrawer}
                setPayError={setPayError}
                setVehicleState={setVehicleState}
                setBreakdownFlow={setBreakdownFlow}
                setToast={setToast}
                setDrawer={setDrawer}
              />
            ) : null}

            {drawer === "status" ? (
              <HuntsStatusDrawerContent
                huntHasStarted={huntHasStarted}
                huntPhase={huntPhase}
                keys={keys}
                keysToWin={keysToWin}
                clock={clock}
                playerPos={playerPos}
                credits={credits}
                huntersHunting={huntersHunting}
                formatNaira={formatCoins}
                travelMode={travelMode}
                isTraveling={isTraveling}
                prep={Boolean(prep)}
                progress={progress}
                fmtCoord={fmtCoord}
                getTaskSeed={getTaskSeed}
                publicTaskStepNumber={publicTaskStepNumber}
                publicTaskDeadlineMs={publicTaskDeadlineMs}
                publicTaskQuestion={publicTaskQuestion}
                publicTaskStage={publicTaskStage}
                publicLocation={publicLocation}
                publicTaskAttempt={publicTaskAttempt}
                relocationCountdown={relocationCountdown}
                locationQuizFailMessage={locationQuizFailMessage}
                publicTaskFeedback={publicTaskFeedback}
                publicTaskAnswer={publicTaskAnswer}
                publicTaskError={publicTaskError}
                setPublicTaskQuestion={setPublicTaskQuestion}
                setPublicTaskStage={setPublicTaskStage}
                setPublicTaskDeadlineMs={setPublicTaskDeadlineMs}
                setPublicTaskAnswer={setPublicTaskAnswer}
                setPublicTaskError={setPublicTaskError}
                setDestinationLabel={setDestinationLabelSafe}
                setPendingDestination={setPendingDestination}
                setPendingDestinationLabel={setPendingDestinationLabel}
                setHuntPhase={setHuntPhase}
                setDrawer={setDrawer}
                publicTaskFromHunt={publicTaskFromHunt}
                firstNextLocation={firstNextLocation}
                failPublicTask={failPublicTask}
                arrivedForChallenge={arrivedForChallenge}
                setArrivedForChallenge={setArrivedForChallenge}
                waypointIndexAtPlayer={waypointIndexAtPlayer}
                arrivalChallengeIntro={arrivalChallengeIntro}
                setArrivalChallengeIntro={setArrivalChallengeIntro}
                startRpsChallenge={startRpsChallenge}
                rps={rps}
                playRps={playRps}
                clueUnlocked={clueUnlocked}
                demoUnlockTasks={demoUnlockTasks}
                unlockCheckpoint={unlockCheckpoint}
                unlockRetry={unlockRetry}
                unlockTaskDeadlineMs={unlockTaskDeadlineMs}
                unlockTaskQuestion={unlockTaskQuestion}
                unlockTaskStage={unlockTaskStage}
                unlockTaskFeedback={unlockTaskFeedback}
                unlockTaskAttempt={unlockTaskAttempt}
                unlockAnswer={unlockAnswer}
                unlockError={unlockError}
                setUnlockTaskQuestion={setUnlockTaskQuestion}
                setUnlockTaskStage={setUnlockTaskStage}
                setUnlockTaskDeadlineMs={setUnlockTaskDeadlineMs}
                setUnlockAnswer={setUnlockAnswer}
                setUnlockError={setUnlockError}
                setClueUnlocked={setClueUnlocked}
                failUnlockTask={failUnlockTask}
                validateAnswer={validateAnswer}
                activeHuntId={activeHuntId}
                getQuestionForStep={getQuestionForStep}
                questionCategories={activeHunt?.question_categories ?? undefined}
                onUnlockTaskCorrect={
                  activeHuntId
                    ? () => {
                        skipNextAtWaypointEffectRef.current = true;
                        setKeys((k) => Math.min(keysToWin, k + 1));
                        setArrivedForChallenge(false);
                        setArrivalChallengeIntro(true);
                      }
                    : undefined
                }
                onPublicTaskCorrect={
                  activeHuntId
                    ? () => {
                        skipNextAtWaypointEffectRef.current = true;
                        setKeys((k) => Math.min(keysToWin, k + 1));
                      }
                    : undefined
                }
                failLocationQuiz={failLocationQuizStable}
                nextWaypointAfterCurrent={
                  waypointIndexAtPlayer != null ? (huntNextLocations[waypointIndexAtPlayer + 1] ?? null) : null
                }
                showLocationQuiz={isAtCurrentWaypoint}
              />
            ) : null}

            {drawer === "garage" ? (
              <HuntsGarageDrawerContent
                vehicleState={vehicleState}
                ownedModes={ownedModes}
                vehicleBlockedReason={vehicleBlockedReason}
                isTraveling={isTraveling}
                isVehicleInUse={(modeId) => isTraveling && travelRef.current?.modeId === modeId}
                setBreakdownFlow={setBreakdownFlow}
                setDrawer={setDrawer}
                startMaintenance={startMaintenance}
              />
            ) : null}

            {drawer === "destination" ? (
              <HuntsDestinationDrawerContent
                searchQuery={searchQuery}
                searchLoading={searchLoading}
                searchError={searchError}
                searchResults={searchResults}
                onQueryChange={setSearchQuery}
                onSearch={() => geocode(searchQuery)}
                onSelectResult={(r) => {
                  if (arrivedForChallenge || isAtCurrentWaypoint) {
                    setDrawer("status");
                    return;
                  }
                  const label = shortenPlaceLabel(r.place_name);
                  setDestinationLabel(label);
                  setPendingDestination({ lng: r.center[0], lat: r.center[1] });
                  setPendingDestinationLabel(label);
                  setDrawer("travel");
                }}
                fmtCoord={fmtCoord}
              />
            ) : null}

            {drawer === "travel" ? (
              <HuntsTravelDrawerContent
                huntHasStarted={huntHasStarted}
                pendingDestination={pendingDestination}
                destination={destination}
                pendingDestinationLabel={pendingDestinationLabel}
                destinationLabel={destinationLabel}
                huntPhase={huntPhase}
                publicLocation={publicLocation}
                fmtCoord={fmtCoord}
                setPendingDestination={setPendingDestination}
                setPendingDestinationLabel={setPendingDestinationLabel}
                baseDirs={baseDirs}
                setBaseDirs={setBaseDirs}
                travelOffers={travelOffers}
                travelPickModeId={travelPickModeId}
                setTravelPickModeId={setTravelPickModeId}
                vehicleState={vehicleState}
                modeRoute={modeRoute}
                selectedTravelOffer={selectedTravelOffer ?? undefined}
                playerPos={playerPos}
                credits={credits}
                formatNaira={formatCoins}
                deductCredits={deductCredits}
                setPayError={setPayError}
                openDrawer={openDrawer}
                beginTravelWithMode={beginTravelWithMode}
                setPlaneFlow={setPlaneFlow}
                setDrawer={setDrawer}
                fmtEta={fmtEta}
                isTraveling={isTraveling}
                travelModeId={travelModeId}
                effectiveTravelModeId={yourCurrentModeId}
                travelActionLoading={travelActionLoading}
                atQuizLocation={arrivedForChallenge || isAtCurrentWaypoint}
                hasActiveStopFlow={stopFlow != null}
                prepModeLock={prep && prep.modeId !== "walk" ? prep.modeId : null}
                drivingRouteChoice={drivingRouteChoice}
                setDrivingRouteChoice={setDrivingRouteChoice}
              />
            ) : null}

            {drawer === "plane" ? (
              <HuntsPlaneDrawerContent
                planeFlow={planeFlow}
                setPlaneFlow={setPlaneFlow}
                progress={progress}
                fmtCoord={fmtCoord}
                setDrawer={setDrawer}
                onChooseTransfer={handlePlaneChooseTransfer}
              />
            ) : null}
            {drawer === "inventory" ? (
              <HuntsInventoryDrawerContent
                shopError={shopError}
                openDrawer={openDrawer}
                inventoryCatalog={inventoryCatalog}
                ownedModes={ownedModes}
                credits={credits}
                formatNaira={formatCoins}
                buyInventoryItem={buyInventoryItem}
                travelModeId={travelModeId}
                setTravelModeId={setTravelModeId}
                modeSpecs={inventoryModeSpecs}
                hasActiveStopFlow={stopFlow != null}
              />
            ) : null}

            {drawer === "coins" ? (
              <HuntsCoinsDrawerContent
                setDrawer={setDrawer}
                payError={payError}
                coinPackages={coinPackages}
                formatNaira={formatNaira}
                startPaystackPayment={startPaystackPayment}
                paystackLoading={paystackLoading}
              />
            ) : null}

            {drawer === "leaderboard" ? (
              <HuntsLeaderboardDrawerContent
                rank={leaderboardRows.rank}
                list={leaderboardRows.list}
                travelModes={TRAVEL_MODES.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
                loading={leaderboardLoading}
              />
            ) : null}
      </HuntsDrawerShell>
    </div>
    </AuthGuard>
  );
}

