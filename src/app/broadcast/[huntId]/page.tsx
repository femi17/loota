"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { bearingDeg, fmtCoord, haversineKm, isLngLatInNigeria, positionAlongRouteAt } from "@/app/hunts/utils";
import { TASK_TIME_SECONDS } from "@/app/hunts/constants";
import { makeAvatarEl, makeDestinationPinEl } from "@/app/hunts/mapMarkerFactories";
import {
  fetchRegionMapViewForHuntCached,
  fetchRegionMapViewForQuery,
  regionMapViewIsWholeNigeria,
  type RegionMapView,
} from "@/lib/region-map-view";
import "mapbox-gl/dist/mapbox-gl.css";

type LngLat = { lng: number; lat: number };

/** Parsed constraint state from player_positions.constraint_state for broadcast display. */
type ConstraintState = {
  status: "finding" | "to_stop" | "relaxing" | "ready_to_pay";
  kind: "refuel" | "rest" | "rejuvenate";
  stop?: { place_name?: string; center: [number, number] };
};

/** Rich narrator state from the hunt page's animation tick — powers the narrator dashboard. */
type NarratorState = {
  legTotalKm: number;
  travelledKm: number;
  remainingKm: number;
  speedKmh: number;
  modeLabel: string;
  fuelPct: number | null;
  vehicleHealthPct: number | null;
  nextThresholdKm: number | null;
  nextThresholdKind: "rejuvenate" | "refuel" | "rest" | null;
  constraintKind: string | null;
  constraintStatus: string | null;
  constraintStopName: string | null;
  destinationLabel: string | null;
};

type BroadcastPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  pos: LngLat;
  keys: number;
  keysToWin: number;
  travelMode: string;
  answeringQuestion: boolean;
  updatedAt: string;
  constraintState: ConstraintState | null;
  narratorState: NarratorState | null;
  currentQuestionText: string | null;
  /** When the quiz timer ends (server); ms since epoch. */
  questionDeadlineAtMs: number | null;
  lastConstraintChoice: PlayerAction | null;
  lastConstraintExited: PlayerAction | null;
  /** Hunts client map zoom (player_positions.map_zoom) — broadcast matches framing. */
  mapZoom: number | null;
  /** Hunts map container width when zoom was recorded. */
  mapWidthPx: number | null;
  /** Raw travel fields from player_positions (fallback for animation when action shadow is stale). */
  travelStartedAtMs: number;
  travelDurationMs: number | null;
  travelRouteCoords: [number, number][] | null;
  /** Latest player activity heartbeat from hunts (used to freeze movement when client goes inactive). */
  lastActiveAtMs: number;
};

/** Keys, active quiz, in-window travel, or meaningful narrator leg — used to enable spotlight scheduling & waypoint place names. */
function broadcastPlayerHasStartedMoving(p: BroadcastPlayer, now = Date.now()): boolean {
  if ((p.keys ?? 0) > 0) return true;
  if (p.answeringQuestion) return true;
  if (String(p.currentQuestionText ?? "").trim()) return true;
  const t0 = p.travelStartedAtMs;
  const dur = p.travelDurationMs ?? 0;
  if (t0 > 0 && dur > 0 && now >= t0 && now < t0 + dur) return true;
  const ns = p.narratorState;
  if (ns && ns.legTotalKm > 0 && ns.travelledKm > 0.05) return true;
  return false;
}

function anyBroadcastPlayerStartedMoving(players: BroadcastPlayer[]): boolean {
  return players.some((p) => broadcastPlayerHasStartedMoving(p));
}

type ChallengeEvent = {
  id: string;
  playerId: string;
  playerName: string;
  category: string;
  questionText: string | null;
  playerAnswer: string;
  correct: boolean;
  timeTakenSeconds: number | null;
  answeredAt: string;
};

type PlayerAction = {
  id: string;
  playerId: string;
  playerName: string;
  actionType: string;
  payload?: {
    choice?: string;
    kind?: string;
    correct?: boolean;
    keys_earned?: number;
    time_taken_seconds?: number;
    modeId?: string;
    startedAt?: string;
    resumedAt?: string;
    pausedAt?: string;
    durationMs?: number | string;
    routeCoords?: unknown;
    from?: unknown;
    to?: unknown;
    finalDestination?: unknown;
    totalMs?: number | string;
    stopName?: string;
    placeName?: string;
  };
  createdAt: string;
};

type TravelShadowState = {
  modeId: string;
  startedAtMs: number;
  durationMs: number;
  routeCoords: [number, number][];
  pausedAtMs: number | null;
  sourceActionAtMs: number;
};

type BroadcastMoment = {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
  body: string;
  createdAt: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
/** If player activity is stale beyond this window, freeze broadcast interpolation at the last active instant. */
const INACTIVE_FREEZE_GRACE_MS = 8000;

const DEFAULT_CENTER: LngLat = { lng: 8.5, lat: 9.5 };
/** Broadcast “show all” / single-player overview when not in tight focus — matches regional feel. */
const DEFAULT_ZOOM = 14;

/** When focusing a player traveling by plane, zoom out so plane speed looks same as on hunts (not faster). */
const PLANE_ZOOM = 6.8;

/** Ground travel / idle street zoom on hunts (`hunts/page.tsx` desiredZoom). */
const HUNTS_STREET_ZOOM = 12;
const FOCUS_ZOOM_MIN = 17;
const FOCUS_ZOOM_MAX = 14;
/** Typical hunts map panel width when `map_width_px` is missing — used to scale zoom for wider broadcast viewports. */
const ASSUMED_HUNTS_MAP_WIDTH_PX = 420;
/**
 * Narrow broadcast viewports (phones) get a negative width-ratio adjustment vs a wide hunts `map_width_px`,
 * which zooms the map out too far. Nudge zoom in on mobile only; desktop/tablet unchanged.
 */
const MOBILE_BROADCAST_FOCUS_ZOOM_BOOST = 1;

/**
 * Match Hunts framing: prefer `map_zoom` + `map_width_px` from player_positions (written by hunts client).
 * When the broadcast map is wider than the hunts container, raise zoom so street detail fills the screen similarly.
 */
function broadcastFocusZoomForPlayer(
  mapZoom: number | null,
  mapWidthPx: number | null,
  broadcastWidthPx: number,
  isPlaneTraveling: boolean,
  isMobile: boolean
): number {
  if (isPlaneTraveling) return PLANE_ZOOM;

  const bw = broadcastWidthPx > 0 ? broadcastWidthPx : 600;

  let z: number;
  if (mapZoom != null && mapWidthPx != null && mapWidthPx > 0) {
    const ratio = bw / mapWidthPx;
    const adj = Math.log2(Math.min(4, Math.max(0.5, ratio)));
    z = mapZoom + adj;
  } else if (mapZoom != null) {
    z = mapZoom;
  } else {
    const ratio = bw / ASSUMED_HUNTS_MAP_WIDTH_PX;
    const adj = Math.log2(Math.min(4, Math.max(0.75, ratio)));
    z = HUNTS_STREET_ZOOM + adj;
  }

  if (isMobile) {
    z += MOBILE_BROADCAST_FOCUS_ZOOM_BOOST;
  }
  return Math.min(FOCUS_ZOOM_MAX, Math.max(FOCUS_ZOOM_MIN, z));
}

/**
 * When the farthest pair of avatars is at least this far apart, "Show all" uses a Nigeria-wide frame
 * instead of tight fitBounds — avoids an awkward zoom when the hunt is regional but one player is still
 * in Lagos (or another distant state) while others are at the hunt.
 */
const SHOW_ALL_NATIONWIDE_MIN_SPAN_KM = 300;
/**
 * For a regional hunt (not whole-Nigeria), if any avatar is this far from the hunt region center
 * (geocoded state/area), use Nigeria-wide framing — catches "GPS still in Lagos" while the hunt is in Ogun
 * even when pairwise avatar distance is small (e.g. only one remote player).
 */
const SHOW_ALL_NATIONWIDE_MIN_DIST_FROM_HUNT_REGION_KM = 140;
/** Whole-country overview (aligned with hunts map default before locator). */
const SHOW_ALL_NATIONWIDE_ZOOM = 5.2;
/**
 * When avatars are clustered, fitBounds alone can zoom to ~building level (maxZoom 16). "Show all" should stay
 * at least region-level so the panel reads as an overview, not a street chase.
 */
const SHOW_ALL_CLUSTER_FIT_MAX_ZOOM = 11;

function collectBroadcastShowAllPositions(
  list: BroadcastPlayer[],
  lastDisplayed: Record<string, LngLat>
): LngLat[] {
  const out: LngLat[] = [];
  for (const p of list) {
    const d = lastDisplayed[p.id] ?? p.pos;
    if (Number.isFinite(d.lng) && Number.isFinite(d.lat)) out.push({ lng: d.lng, lat: d.lat });
  }
  return out;
}

function maxPairwiseDistanceKm(positions: LngLat[]): number {
  let max = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = haversineKm(positions[i]!, positions[j]!);
      if (d > max) max = d;
    }
  }
  return max;
}

function maxDistanceFromReferenceKm(positions: LngLat[], ref: LngLat): number {
  let max = 0;
  for (const p of positions) {
    const d = haversineKm(p, ref);
    if (d > max) max = d;
  }
  return max;
}

type BroadcastShowAllCameraPlan =
  | { kind: "none" }
  | { kind: "one"; center: LngLat }
  | { kind: "nationwide" }
  | { kind: "fit"; positions: LngLat[] };

function getBroadcastShowAllCameraPlan(
  list: BroadcastPlayer[],
  lastDisplayed: Record<string, LngLat>,
  huntRegionView: RegionMapView | null
): BroadcastShowAllCameraPlan {
  const positions = collectBroadcastShowAllPositions(list, lastDisplayed);
  if (positions.length === 0) return { kind: "none" };
  if (positions.length === 1) return { kind: "one", center: positions[0]! };
  // If anyone is outside Nigeria, a fixed Nigeria-centered "nationwide" frame
  // will keep remote players off-screen.
  if (positions.some((p) => !isLngLatInNigeria(p))) return { kind: "fit", positions };
  if (maxPairwiseDistanceKm(positions) >= SHOW_ALL_NATIONWIDE_MIN_SPAN_KM) return { kind: "nationwide" };
  const regionalHunt =
    huntRegionView &&
    !regionMapViewIsWholeNigeria(huntRegionView) &&
    Number.isFinite(huntRegionView.center.lng) &&
    Number.isFinite(huntRegionView.center.lat);
  if (regionalHunt) {
    const hc = huntRegionView!.center;
    if (
      maxDistanceFromReferenceKm(positions, { lng: hc.lng, lat: hc.lat }) >=
      SHOW_ALL_NATIONWIDE_MIN_DIST_FROM_HUNT_REGION_KM
    ) {
      return { kind: "nationwide" };
    }
  }
  return { kind: "fit", positions };
}

function applyBroadcastShowAllPlanToMap(
  map: any,
  plan: BroadcastShowAllCameraPlan,
  mapboxModule: { LngLatBounds?: new () => { extend: (ll: [number, number]) => void } } | null,
  durationMs: number,
  padding: number,
  maxZoom: number
): void {
  if (plan.kind === "none") return;
  if (plan.kind === "fit" && !mapboxModule?.LngLatBounds) return;
  try {
    if (typeof map.stop === "function") map.stop();
  } catch {
    /* ignore */
  }
  try {
    if (plan.kind === "one") {
      map.easeTo({
        center: [plan.center.lng, plan.center.lat],
        zoom: DEFAULT_ZOOM,
        duration: durationMs,
      });
      return;
    }
    if (plan.kind === "nationwide") {
      map.easeTo({
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: SHOW_ALL_NATIONWIDE_ZOOM,
        duration: durationMs,
      });
      return;
    }
    if (plan.kind === "fit") {
      const LngLatBounds = mapboxModule?.LngLatBounds;
      if (!LngLatBounds) return;
      const bounds = new LngLatBounds();
      plan.positions.forEach((p) => bounds.extend([p.lng, p.lat]));
      const fitMaxZoom = Math.min(maxZoom, SHOW_ALL_CLUSTER_FIT_MAX_ZOOM);
      map.fitBounds(bounds, {
        padding,
        duration: durationMs,
        maxZoom: fitMaxZoom,
      });
    }
  } catch {
    /* ignore */
  }
}

function findBroadcastPlayerByFocusId(
  list: BroadcastPlayer[],
  focusId: string
): BroadcastPlayer | undefined {
  if (!focusId) return undefined;
  const fid = String(focusId).trim().toLowerCase();
  return list.find((p) => String(p.id).trim().toLowerCase() === fid);
}
/** Same camera settings as "Show all" fitBounds — used for individual focus so both views feel consistent. */
const BROADCAST_FIT_PADDING = 80;
const BROADCAST_FIT_DURATION_MS = 600;
const BROADCAST_FIT_MAX_ZOOM = 16;
/** Max width (px) to treat as mobile — use center-on-avatar so route matches screen. */
const MOBILE_MAX_WIDTH = 768;

const TRAVEL_MODE_ICON: Record<string, string> = {
  walk: "directions_walk",
  bicycle: "directions_bike",
  motorbike: "two_wheeler",
  car: "directions_car",
  bus: "directions_bus",
  bus_pass: "directions_bus",
  plane: "flight_takeoff",
  air_taxi: "flight_takeoff",
};

function travelIcon(mode: string): string {
  return TRAVEL_MODE_ICON[mode] ?? "directions_walk";
}

// All travel simulation math (haversine, bearing, cumKm, interpolation)
// is now in @/lib/travel-simulation — the SAME code the hunt page uses.

function parseNarratorState(raw: unknown): NarratorState | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof o.legTotalKm !== "number") return null;
    return {
      legTotalKm: o.legTotalKm ?? 0,
      travelledKm: o.travelledKm ?? 0,
      remainingKm: o.remainingKm ?? 0,
      speedKmh: o.speedKmh ?? 0,
      modeLabel: o.modeLabel ?? "",
      fuelPct: typeof o.fuelPct === "number" ? o.fuelPct : null,
      vehicleHealthPct: typeof o.vehicleHealthPct === "number" ? o.vehicleHealthPct : null,
      nextThresholdKm: typeof o.nextThresholdKm === "number" ? o.nextThresholdKm : null,
      nextThresholdKind: o.nextThresholdKind ?? null,
      constraintKind: o.constraintKind ?? null,
      constraintStatus: o.constraintStatus ?? null,
      constraintStopName: o.constraintStopName ?? null,
      destinationLabel: o.destinationLabel ?? null,
    };
  } catch {
    return null;
  }
}

/** Parse constraint_state from player_positions for broadcast (status, kind, stop center for marker). */
function parseConstraintState(raw: unknown): ConstraintState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = o.status as string | undefined;
  const kind = o.kind as string | undefined;
  if (
    (status === "finding" || status === "to_stop" || status === "relaxing" || status === "ready_to_pay") &&
    (kind === "refuel" || kind === "rest" || kind === "rejuvenate")
  ) {
    const stop = o.stop as { place_name?: string; center?: [number, number] } | undefined;
    const center = stop?.center;
    const hasCenter = Array.isArray(center) && center.length >= 2 && typeof center[0] === "number" && typeof center[1] === "number";
    return {
      status,
      kind,
      ...(hasCenter ? { stop: { place_name: stop?.place_name, center: [center[0], center[1]] } } : {}),
    };
  }
  return null;
}

/** Normalize travel_route_coords from DB/realtime (array, JSON string, or array-like object). */
function normalizeTravelRouteCoords(raw: unknown): [number, number][] | null {
  const toFinite = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const normalizePoint = (pt: unknown): [number, number] | null => {
    if (Array.isArray(pt) && pt.length >= 2) {
      const lng = toFinite(pt[0]);
      const lat = toFinite(pt[1]);
      return lng != null && lat != null ? [lng, lat] : null;
    }
    if (pt && typeof pt === "object") {
      const o = pt as Record<string, unknown>;
      const lng = toFinite(o.lng ?? o.longitude);
      const lat = toFinite(o.lat ?? o.latitude);
      return lng != null && lat != null ? [lng, lat] : null;
    }
    return null;
  };

  if (Array.isArray(raw) && raw.length >= 2) {
    const points = raw
      .map((pt) => normalizePoint(pt))
      .filter((pt): pt is [number, number] => pt != null);
    return points.length >= 2 ? points : null;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeTravelRouteCoords(parsed);
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const arr: [number, number][] = [];
    let i = 0;
    while (Object.prototype.hasOwnProperty.call(raw, i)) {
      const pt = (raw as Record<number, unknown>)[i];
      const normalized = normalizePoint(pt);
      if (normalized) arr.push(normalized);
      i++;
    }
    return arr.length >= 2 ? arr : null;
  }
  return null;
}

function parseTimestampMs(raw: unknown): number {
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw) {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function parseDurationMs(raw: unknown): number | null {
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  return null;
}

/**
 * Single source of truth for map + focus camera: route interpolation vs DB lng/lat.
 * Must match the marker RAF so a focused follow shot stays on the moving avatar.
 */
function computeBroadcastAvatarLngLat(
  p: BroadcastPlayer,
  shadowMap: Record<string, TravelShadowState | null>,
  dbRouteByPid: Record<string, [number, number][] | null>,
  now: number
): { pos: LngLat; isTraveling: boolean } {
  const pid = String(p.id);
  const shadow = shadowMap[pid] ?? shadowMap[p.id];
  const dbRoute = dbRouteByPid[pid] ?? dbRouteByPid[p.id] ?? null;
  const fallbackRoute = p.travelRouteCoords ?? dbRoute;
  /** Do not interpolate along the main hunt leg while stop flow is active (matches hunts: avatar follows DB, not the old route). */
  const freezeMainRouteForStopConstraint =
    p.constraintState &&
    // Only freeze when the avatar is already in the "stop flow" end-state.
    // During "finding/to_stop" they should still travel along the route to avoid
    // being left at stale DB lng/lat (which looks like an imaginary offset).
    (p.constraintState.status === "relaxing" || p.constraintState.status === "ready_to_pay");

  let pos: LngLat;
  let isTraveling = false;
  const travelEndGraceMs = INACTIVE_FREEZE_GRACE_MS;
  const dbTravelDurationMs = Number(p.travelDurationMs ?? 0);
  const dbTravelWindowActive =
    p.travelStartedAtMs > 0 &&
    dbTravelDurationMs > 0 &&
    now <= p.travelStartedAtMs + dbTravelDurationMs + travelEndGraceMs;

  if (
    !freezeMainRouteForStopConstraint &&
    shadow &&
    shadow.durationMs > 0 &&
    shadow.routeCoords &&
    shadow.routeCoords.length >= 2 &&
    ((shadow.pausedAtMs != null && shadow.pausedAtMs > shadow.startedAtMs) ||
      now <= shadow.startedAtMs + shadow.durationMs + travelEndGraceMs) &&
    (dbTravelWindowActive || now - shadow.sourceActionAtMs <= 10_000)
  ) {
    const routeCoords = shadow.routeCoords;
    const legEndMs = shadow.startedAtMs + shadow.durationMs;
    const stillInScheduledLeg = now >= shadow.startedAtMs && now <= legEndMs;
    const freezeAtMs =
      stillInScheduledLeg || !(p.lastActiveAtMs > 0)
        ? null
        : p.lastActiveAtMs + INACTIVE_FREEZE_GRACE_MS;
    if (freezeAtMs != null && now > freezeAtMs) {
      return { pos: p.pos, isTraveling: false };
    }
    const sampleAt =
      shadow.pausedAtMs && shadow.pausedAtMs > shadow.startedAtMs
        ? Math.min(shadow.pausedAtMs, legEndMs)
        : Math.min(now, legEndMs, freezeAtMs ?? Number.POSITIVE_INFINITY);
    if (sampleAt <= shadow.startedAtMs) {
      pos = { lng: routeCoords[0][0], lat: routeCoords[0][1] };
    } else {
      pos = positionAlongRouteAt(routeCoords, shadow.startedAtMs, shadow.durationMs, sampleAt);
    }
    isTraveling = true;
  } else if (
    !freezeMainRouteForStopConstraint &&
    fallbackRoute &&
    fallbackRoute.length >= 2 &&
    p.travelStartedAtMs > 0 &&
    Number(p.travelDurationMs ?? 0) > 0 &&
    dbTravelWindowActive
  ) {
    const duration = Number(p.travelDurationMs);
    const legEndMs = p.travelStartedAtMs + duration;
    const stillInScheduledLeg = now >= p.travelStartedAtMs && now <= legEndMs;
    const freezeAtMs =
      stillInScheduledLeg || !(p.lastActiveAtMs > 0)
        ? null
        : p.lastActiveAtMs + INACTIVE_FREEZE_GRACE_MS;
    if (freezeAtMs != null && now > freezeAtMs) {
      return { pos: p.pos, isTraveling: false };
    }
    const sampleAt = Math.min(now, legEndMs, freezeAtMs ?? Number.POSITIVE_INFINITY);
    if (sampleAt <= p.travelStartedAtMs) {
      pos = { lng: fallbackRoute[0][0], lat: fallbackRoute[0][1] };
    } else {
      pos = positionAlongRouteAt(fallbackRoute, p.travelStartedAtMs, duration, sampleAt);
    }
    isTraveling = true;
  } else {
    pos = p.pos;
  }
  return { pos, isTraveling };
}

function buildTravelShadowFromAction(action: PlayerAction): TravelShadowState | null {
  if (
    action.actionType !== "travel_started" &&
    action.actionType !== "travel_paused" &&
    action.actionType !== "travel_resumed"
  ) {
    return null;
  }
  let rawRouteCoords = action.payload?.routeCoords;
  if (typeof rawRouteCoords === "string") {
    try {
      rawRouteCoords = JSON.parse(rawRouteCoords) as unknown;
    } catch {
      rawRouteCoords = undefined;
    }
  }
  const routeCoords = normalizeTravelRouteCoords(rawRouteCoords);
  const durationMs =
    parseDurationMs(action.payload?.durationMs) ??
    parseDurationMs(action.payload?.totalMs);
  let startedAtMs = parseTimestampMs(action.payload?.startedAt);
  if (startedAtMs <= 0) startedAtMs = parseTimestampMs(action.createdAt);
  if (!routeCoords || routeCoords.length < 2 || !durationMs || durationMs <= 0 || startedAtMs <= 0)
    return null;
  const pausedAtMs =
    action.actionType === "travel_paused" ? parseTimestampMs(action.payload?.pausedAt) || null : null;
  const sourceActionAtMs = parseTimestampMs(action.createdAt);
  return {
    modeId: action.payload?.modeId ?? "walk",
    startedAtMs,
    durationMs,
    routeCoords,
    pausedAtMs,
    sourceActionAtMs,
  };
}

/** Stub shadow (from→to straight line) so we animate smoothly until Mapbox returns. Avoids falling back to p.pos. */
function buildStubTravelShadow(
  from: LngLat,
  to: LngLat,
  startedAtMs: number,
  modeId: string
): TravelShadowState {
  const routeCoords: [number, number][] = [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ];
  const km = haversineKm(from, to);
  const minDurationMs = 3000;
  const speedKmh = modeId === "plane" ? 400 : modeId === "car" ? 60 : modeId === "bus" ? 25 : 5;
  const durationMs = Math.max(minDurationMs, Math.round((km / Math.max(0.1, speedKmh)) * 3600 * 1000));
  return {
    modeId,
    startedAtMs: Math.min(startedAtMs, Date.now()),
    durationMs,
    routeCoords,
    pausedAtMs: null,
    sourceActionAtMs: Date.now(),
  };
}

function lastRoutePoint(routeCoords: [number, number][]): LngLat {
  const last = routeCoords[routeCoords.length - 1];
  return last ? { lng: last[0], lat: last[1] } : { lng: 0, lat: 0 };
}

/** Parse from/to from action payload. */
function parseFromTo(raw: unknown): LngLat | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lng = typeof o.lng === "number" ? o.lng : typeof o.longitude === "number" ? o.longitude : null;
  const lat = typeof o.lat === "number" ? o.lat : typeof o.latitude === "number" ? o.latitude : null;
  if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

const AVATAR_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#EF4444"];

/** Activity status for broadcast: what to show on avatar and spotlight. */
type AvatarActivity = "quiz" | "sos" | "stop" | "rest" | "refuel" | null;

function getAvatarActivity(p: BroadcastPlayer): AvatarActivity {
  if (p.answeringQuestion || Boolean(p.currentQuestionText?.trim())) return "quiz";
  const c = p.constraintState;
  if (!c) return null;
  if (c.status === "ready_to_pay") return "sos";
  if (c.status === "finding") return "stop";
  if (c.status === "to_stop") return "stop";
  if (c.status === "relaxing") {
    if (c.kind === "refuel") return "refuel";
    if (c.kind === "rest") return "rest";
    return "rest"; // rejuvenate → show as rest
  }
  return null;
}

const ACTIVITY_LABEL: Record<NonNullable<AvatarActivity>, string> = {
  quiz: "Quiz",
  sos: "SOS",
  stop: "STOP",
  rest: "REST",
  refuel: "REFUEL",
};

const THRESHOLD_LABEL: Record<string, string> = {
  rejuvenate: "rest",
  refuel: "refuel",
  rest: "rest stop",
};

/**
 * Full snapshot (positions, travel, quiz, actions, moments).
 * Realtime on player_positions gives near-instant updates; poll is a fallback.
 */
const POLL_INTERVAL_MS = 2000;
/** Cheap roster signature — when it changes, we run a full snapshot (positions + registrations). */
const ROSTER_POLL_MS = 1000;
/** Auto spotlight: show each player for this long before rotating (strict 1 minute). */
const AUTO_FOCUS_MS = 60 * 1000;
const TOAST_LIFETIME_MS = 5000;
/** Max distance from current waypoint to show quiz UI (avoids stale answering_question when avatar has moved). */
const BROADCAST_QUIZ_PROXIMITY_KM = 1.5;

/** PostgREST unknown column / schema cache (DB missing migrations). */
function isSupabaseMissingColumnError(err: unknown): boolean {
  const o = err as { code?: string; message?: string };
  const code = o?.code;
  const msg = String(o?.message ?? "");
  return code === "PGRST204" || code === "42703" || /column|schema cache/i.test(msg);
}

/** Table missing or not exposed to API (broadcast still works without action feed). */
function isSupabaseMissingTableError(err: unknown): boolean {
  const o = err as { code?: string; message?: string };
  const msg = String(o?.message ?? "");
  return (
    o?.code === "PGRST205" ||
    /relation.*does not exist|Could not find the table/i.test(msg)
  );
}

const PLAYER_POSITIONS_SELECT_FULL =
  "player_id, player_name, lng, lat, keys, travel_mode, travel_started_at, travel_route_coords, travel_duration_ms, answering_question, current_question, question_deadline_at, updated_at, last_active_at, constraint_state, narrator_state, map_zoom, map_width_px";

const PLAYER_POSITIONS_SELECT_CORE =
  "player_id, player_name, lng, lat, keys, travel_mode, travel_started_at, travel_route_coords, travel_duration_ms, answering_question, current_question, updated_at";

const PLAYER_POSITIONS_SELECT_LEGACY =
  "player_id, player_name, lng, lat, keys, travel_mode, answering_question, current_question, updated_at";

const QUESTION_RESPONSES_SELECT_FULL =
  "id, player_id, question_id, question_text, answer, is_correct, time_taken_seconds, answered_at";
const QUESTION_RESPONSES_SELECT_LEGACY =
  "id, player_id, question_id, question_location, answer, is_correct, time_taken_seconds, answered_at";

function lngLatFromWaypoint(w: { lng?: unknown; lat?: unknown } | null | undefined): LngLat | null {
  const lng = typeof w?.lng === "number" ? w.lng : NaN;
  const lat = typeof w?.lat === "number" ? w.lat : NaN;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/** Waypoint index for current challenge matches hunts `huntNextLocations[keys]`. */
function currentQuizWaypointForKeys(
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined,
  keys: number
): LngLat | null {
  if (!waypoints?.length) return null;
  const idx = Math.min(Math.max(0, keys), waypoints.length - 1);
  return lngLatFromWaypoint(waypoints[idx]);
}

type FocusDestPinColor = "blue" | "green" | "yellow" | "red";

function isBroadcastTravelLegActive(
  p: BroadcastPlayer,
  shadow: TravelShadowState | null | undefined,
  nowMs: number
): boolean {
  if (shadow && shadow.durationMs > 0 && shadow.routeCoords && shadow.routeCoords.length >= 2) {
    const end = shadow.startedAtMs + shadow.durationMs;
    return nowMs >= shadow.startedAtMs && nowMs < end;
  }
  const d = p.travelDurationMs;
  if (p.travelStartedAtMs > 0 && d != null && d > 0 && p.travelRouteCoords && p.travelRouteCoords.length >= 2) {
    const end = p.travelStartedAtMs + d;
    return nowMs >= p.travelStartedAtMs && nowMs < end;
  }
  return false;
}

/**
 * Single destination pin for the focused player — stop (blue/yellow) → travel end (green if walk/bike/motorbike quiz leg, else yellow) → quiz waypoint (green).
 */
function computeFocusedPlayerDestinationPin(
  p: BroadcastPlayer | undefined,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined,
  shadow: TravelShadowState | null | undefined,
  nowMs: number
): { lng: number; lat: number; color: FocusDestPinColor } | null {
  if (!p) return null;

  const mode = typeof p.travelMode === "string" && p.travelMode ? p.travelMode : "walk";
  const isBus = mode === "bus";
  const quizTarget = currentQuizWaypointForKeys(waypoints, p.keys);
  const quizPosOk = quizTarget != null && isLngLatInNigeria(quizTarget);
  const quizSurfaceLeg =
    quizPosOk &&
    (mode === "walk" || mode === "bicycle" || mode === "motorbike") &&
    !isBus;

  const c = p.constraintState;
  const stopCenter = c?.stop?.center;
  const hasStop =
    stopCenter &&
    stopCenter.length >= 2 &&
    (c?.status === "finding" ||
      c?.status === "to_stop" ||
      c?.status === "relaxing" ||
      c?.status === "ready_to_pay");

  if (hasStop && c && (c.kind === "rejuvenate" || c.kind === "rest")) {
    const pos = { lng: stopCenter[0], lat: stopCenter[1] };
    if (isLngLatInNigeria(pos)) return { ...pos, color: "blue" };
  }

  if (hasStop && c && c.kind === "refuel") {
    const pos = { lng: stopCenter[0], lat: stopCenter[1] };
    if (isLngLatInNigeria(pos)) return { ...pos, color: "yellow" };
  }

  if (isBroadcastTravelLegActive(p, shadow, nowMs)) {
    const route =
      shadow?.routeCoords && shadow.routeCoords.length >= 2
        ? shadow.routeCoords
        : p.travelRouteCoords && p.travelRouteCoords.length >= 2
          ? p.travelRouteCoords
          : null;
    if (route) {
      const last = route[route.length - 1];
      if (last && last.length >= 2) {
        const pos = { lng: last[0], lat: last[1] };
        if (isLngLatInNigeria(pos)) return { ...pos, color: quizSurfaceLeg ? "green" : "yellow" };
      }
    }
  }

  if (quizTarget && isLngLatInNigeria(quizTarget)) {
    return { lng: quizTarget.lng, lat: quizTarget.lat, color: "green" };
  }

  return null;
}

/** True if quiz-related flags are absent, or player is near enough to the expected waypoint. */
function broadcastQuizGeoPlausible(
  p: BroadcastPlayer,
  displayPos: LngLat | null | undefined,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): boolean {
  if (!p.answeringQuestion && !p.currentQuestionText) return true;
  const target = currentQuizWaypointForKeys(waypoints, p.keys);
  if (!target || !displayPos) return true;
  return haversineKm(displayPos, target) <= BROADCAST_QUIZ_PROXIMITY_KM;
}

/** Actively at the checkpoint with a live question (broadcast + focus lock). */
function broadcastActivelyAtQuiz(
  p: BroadcastPlayer,
  displayPos: LngLat | null | undefined,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): boolean {
  const hasQuiz = p.answeringQuestion || Boolean(p.currentQuestionText?.trim());
  if (!hasQuiz) return false;
  return broadcastQuizGeoPlausible(p, displayPos, waypoints);
}

/** Map pill activity: suppress stale "quiz" when far from waypoint. */
function getBroadcastMapActivity(
  p: BroadcastPlayer,
  displayPos: LngLat,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): AvatarActivity {
  if (p.answeringQuestion || Boolean(p.currentQuestionText?.trim())) {
    if (!broadcastQuizGeoPlausible(p, displayPos, waypoints)) return null;
    return "quiz";
  }
  const c = p.constraintState;
  if (!c) return null;
  if (c.status === "ready_to_pay") return "sos";
  if (c.status === "finding") return "stop";
  if (c.status === "to_stop") return "stop";
  if (c.status === "relaxing") {
    if (c.kind === "refuel") return "refuel";
    if (c.kind === "rest") return "rest";
    return "rest";
  }
  return null;
}

function formatConstraintKind(kind?: string | null): string {
  if (kind === "refuel") return "refuel";
  if (kind === "rejuvenate") return "rejuvenate";
  return "rest";
}

function formatConstraintChoice(choice?: string): string {
  if (choice === "go_to_stop") return "stopped to recover";
  if (choice === "keep_going") return "kept going";
  return "made a decision";
}

function shortPlayerName(name: string): string {
  if (!name) return "Loota";
  return name.length > 8 ? name.slice(0, 8) : name;
}

function buildConstraintFocusCopy(player: BroadcastPlayer): string | null {
  const c = player.constraintState;
  if (!c) return null;
  const stopName = c.stop?.place_name ?? "a nearby stop";
  const shortName = shortPlayerName(player.name);
  if (c.status === "to_stop") {
    return `${shortName} needs to ${formatConstraintKind(c.kind)}. Are they heading to ${stopName} or choosing to keep going?`;
  }
  if (c.status === "relaxing") {
    return `${player.name} is currently ${c.kind === "refuel" ? "refueling" : "resting"} at ${stopName}.`;
  }
  if (c.status === "ready_to_pay") {
    return `${player.name} has run into trouble at ${stopName} and needs help before continuing.`;
  }
  return null;
}

/** Live quiz only — do not show past question_responses here (feels stale next to “Idle”). */
function buildQuizFocusCopy(
  player: BroadcastPlayer,
  _latestChallenge: ChallengeEvent | null,
  displayPos: LngLat | null | undefined,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): string | null {
  if (!player.answeringQuestion && !player.currentQuestionText?.trim()) return null;
  if (!broadcastQuizGeoPlausible(player, displayPos, waypoints)) return null;
  if (player.currentQuestionText) {
    return `${player.name} is facing a quiz right now: "${player.currentQuestionText}"`;
  }
  return `${player.name} is answering a challenge question right now.`;
}

const NEAR_WAYPOINT_IDLE_KM = 2.5;

/**
 * Human hint when idle. Waypoint names only after the player has started the hunt (moving / keys / quiz);
 * before that, use coordinates only so we don’t label everyone “near first checkpoint” from spawn noise.
 */
function describeBroadcastIdleLocation(
  pos: LngLat,
  waypoints: Array<{ label?: string; lng?: number; lat?: number }> | null | undefined,
  allowWaypointPlaceNames: boolean
): string {
  let best: { km: number; label: string } | null = null;
  if (allowWaypointPlaceNames && waypoints?.length) {
    for (const w of waypoints) {
      const ll = lngLatFromWaypoint(w);
      if (!ll) continue;
      const km = haversineKm(pos, ll);
      const label = typeof w.label === "string" && w.label.trim() ? w.label.trim() : "Checkpoint";
      if (!best || km < best.km) best = { km, label };
    }
  }
  if (best && best.km <= NEAR_WAYPOINT_IDLE_KM) {
    if (best.km < 0.35) return `At or very near “${best.label}”`;
    return `Near “${best.label}” (~${best.km.toFixed(1)} km)`;
  }
  // Never prefix with hunt region (e.g. Ogun) — players can be anywhere; coords are ground truth.
  return `${fmtCoord(pos.lat)}, ${fmtCoord(pos.lng)}`;
}

function focusedPlayerShowsIdleNarrator(p: BroadcastPlayer, narratorLine: string): boolean {
  if (narratorLine.includes("Idle.") || narratorLine === "Waiting to start.") return true;
  if (!p.narratorState && p.keys > 0 && !p.answeringQuestion && !p.currentQuestionText?.trim()) return true;
  return false;
}

/** One rotating line per non-focused player for the bottom feed. */
function buildSingleOtherPlayerFeedLine(
  p: BroadcastPlayer,
  displayPos: LngLat,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): string {
  if (p.constraintState?.status === "ready_to_pay") {
    return `${p.name} needs help (SOS)`;
  }
  if (broadcastActivelyAtQuiz(p, displayPos, waypoints)) {
    return `${p.name} is at the challenge (quiz)`;
  }
  const c = p.constraintState;
  if (c?.status === "to_stop") {
    const kind = c.kind === "refuel" ? "refuel" : c.kind === "rejuvenate" ? "rejuvenate" : "rest";
    return `${p.name} is heading to a ${kind} stop`;
  }
  if (c?.status === "relaxing") {
    const verb = c.kind === "refuel" ? "Refueling" : "Resting";
    const where = c.stop?.place_name ? ` at ${c.stop.place_name}` : "";
    return `${p.name}: ${verb}${where}`;
  }
  const ns = p.narratorState;
  if (ns && ns.legTotalKm > 0) {
    const pct = Math.min(100, Math.round((ns.travelledKm / ns.legTotalKm) * 100));
    const dest = ns.destinationLabel ? ` → ${ns.destinationLabel}` : "";
    return `${p.name}: ${ns.modeLabel} ${pct}% of leg${dest}`;
  }
  const loc = describeBroadcastIdleLocation(
    displayPos,
    waypoints,
    broadcastPlayerHasStartedMoving(p)
  );
  return `${p.name}: ${p.keys} key${p.keys !== 1 ? "s" : ""} · idle · ${loc}`;
}

function buildOtherPlayersActivityFeed(
  players: BroadcastPlayer[],
  focusPlayerId: string,
  posById: Record<string, LngLat>,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): string[] {
  const others = players.filter((p) => p.id !== focusPlayerId);
  if (others.length === 0) return [];
  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((p) => {
    const displayPos = posById[p.id] ?? p.pos;
    return buildSingleOtherPlayerFeedLine(p, displayPos, waypoints);
  });
}

function buildActionMoment(action: PlayerAction): BroadcastMoment | null {
  if (action.actionType === "constraint_entered") {
    const kind = formatConstraintKind(action.payload?.kind);
    const stopName =
      typeof action.payload?.stopName === "string"
        ? action.payload.stopName
        : typeof action.payload?.placeName === "string"
          ? action.payload.placeName
          : null;
    return {
      id: `action-${action.id}`,
      playerId: action.playerId,
      playerName: action.playerName,
      title: `${action.playerName} is going to ${kind}`,
      body: stopName
        ? `${action.playerName} is heading to ${stopName}.`
        : `${action.playerName} is heading to a ${kind} spot.`,
      createdAt: action.createdAt,
      tone: "warning",
    };
  }
  if (action.actionType === "constraint_choice") {
    return {
      id: `action-${action.id}`,
      playerId: action.playerId,
      playerName: action.playerName,
      title: `${action.playerName} made a stop decision`,
      body:
        action.payload?.choice === "go_to_stop"
          ? `${action.playerName} will stop and recover.`
          : `${action.playerName} chose to keep moving.`,
      createdAt: action.createdAt,
      tone: action.payload?.choice === "go_to_stop" ? "info" : "warning",
    };
  }
  if (action.actionType === "constraint_exited") {
    return {
      id: `action-${action.id}`,
      playerId: action.playerId,
      playerName: action.playerName,
      title: `${action.playerName} is moving again`,
      body: "The stop is over and the journey continues.",
      createdAt: action.createdAt,
      tone: "success",
    };
  }
  if (action.actionType === "quiz_answered") {
    const correct = Boolean(action.payload?.correct);
    return {
      id: `action-${action.id}`,
      playerId: action.playerId,
      playerName: action.playerName,
      title: correct ? `${action.playerName} got the quiz key` : `${action.playerName} missed the quiz`,
      body: correct
        ? `${action.playerName} answered correctly and moved up.`
        : `${action.playerName} answered wrongly. Try again.`,
      createdAt: action.createdAt,
      tone: correct ? "success" : "danger",
    };
  }
  return null;
}

function buildChallengeMoment(challenge: ChallengeEvent): BroadcastMoment {
  return {
    id: `challenge-${challenge.id}`,
    playerId: challenge.playerId,
    playerName: challenge.playerName,
    title: challenge.correct
      ? `${challenge.playerName} just got to the quiz center`
      : `${challenge.playerName} is still at the quiz center`,
    body: challenge.questionText
      ? `${challenge.questionText} — ${challenge.correct ? "correct answer" : "wrong answer"}: ${challenge.playerAnswer}`
      : `${challenge.correct ? "Correct" : "Wrong"} answer: ${challenge.playerAnswer}`,
    createdAt: challenge.answeredAt,
    tone: challenge.correct ? "success" : "danger",
  };
}

/** Build narrator-friendly story line from narrator state. */
function buildNarratorLine(
  p: BroadcastPlayer,
  opts?: {
    displayPos?: LngLat | null;
    waypoints?: Array<{ lng?: number; lat?: number }> | null;
  }
): string {
  const ns = p.narratorState;
  const activity = getAvatarActivity(p);
  const quizOk = broadcastQuizGeoPlausible(p, opts?.displayPos ?? null, opts?.waypoints);

  if (activity === "sos") return `Needs rescue — SOS active!`;
  if (activity === "quiz" && quizOk) return `Answering a challenge question…`;
  if (p.currentQuestionText && quizOk) return "At the quiz location.";
  if (activity === "refuel") return `Refueling at ${ns?.constraintStopName ?? "a station"}…`;
  if (activity === "rest") return `Resting at ${ns?.constraintStopName ?? "a spot"}…`;
  if (activity === "stop") return `Heading to a ${ns?.constraintKind ?? "stop"}…`;

  if (!ns) {
    if (p.keys > 0) return `${p.keys} key${p.keys !== 1 ? "s" : ""} collected. Idle.`;
    return "Waiting to start.";
  }

  const pct = ns.legTotalKm > 0 ? Math.round((ns.travelledKm / ns.legTotalKm) * 100) : 0;
  let line = `${ns.modeLabel} ${ns.travelledKm.toFixed(1)}km of ${ns.legTotalKm.toFixed(1)}km (${pct}%)`;

  if (ns.destinationLabel) line += ` → ${ns.destinationLabel}`;

  if (ns.nextThresholdKm != null && ns.nextThresholdKind) {
    const label = THRESHOLD_LABEL[ns.nextThresholdKind] ?? ns.nextThresholdKind;
    if (ns.nextThresholdKm <= 0.5) {
      line += ` — ${label} imminent!`;
    } else {
      line += ` — ${label} in ${ns.nextThresholdKm.toFixed(1)}km`;
    }
  }

  if (ns.fuelPct != null && ns.fuelPct <= 25) {
    line += ` ⛽ ${ns.fuelPct}%`;
  }

  if (ns.vehicleHealthPct != null && ns.vehicleHealthPct <= 20) {
    line += ` ⚠ health ${ns.vehicleHealthPct}%`;
  }

  return line;
}

/** Show “missed quiz / relocated” instead of generic “Idle” while this is still relevant. */
const QUIZ_MISS_NARRATOR_WINDOW_MS = 45 * 60 * 1000;
/** Farther than this from the current checkpoint → treat like anti-cheat “random Nigeria” move vs ~2 km penalty. */
const QUIZ_MISS_DISTANT_KM = 12;

function isBroadcastActivelyTravelingForCard(p: BroadcastPlayer): boolean {
  const c = p.constraintState;
  if (
    c &&
    (c.status === "finding" ||
      c.status === "to_stop" ||
      c.status === "relaxing" ||
      c.status === "ready_to_pay")
  ) {
    return false;
  }
  const now = Date.now();
  if (p.travelStartedAtMs > 0 && (p.travelDurationMs ?? 0) > 0) {
    if (now < p.travelStartedAtMs + (p.travelDurationMs as number)) return true;
  }
  const ns = p.narratorState;
  if (ns && ns.legTotalKm > 0 && ns.travelledKm < ns.legTotalKm - 0.02) return true;
  return false;
}

/**
 * After a wrong answer, hunts relocates the player (~2 km, or random-in-Nigeria for cheat).
 * Broadcast only sees DB + question_responses — infer and explain instead of “Idle.”
 */
function buildQuizMissPenaltyNarratorLine(
  p: BroadcastPlayer,
  latest: ChallengeEvent | null,
  displayPos: LngLat,
  waypoints: Array<{ lng?: number; lat?: number }> | null | undefined
): string | null {
  if (!latest || latest.correct) return null;
  const answeredMs = new Date(latest.answeredAt).getTime();
  if (!Number.isFinite(answeredMs)) return null;
  if (Date.now() - answeredMs > QUIZ_MISS_NARRATOR_WINDOW_MS) return null;
  if (p.answeringQuestion || Boolean(p.currentQuestionText?.trim())) return null;
  const c = p.constraintState;
  if (
    c?.status === "finding" ||
    c?.status === "to_stop" ||
    c?.status === "relaxing" ||
    c?.status === "ready_to_pay"
  )
    return null;
  if (isBroadcastActivelyTravelingForCard(p)) return null;

  const target = currentQuizWaypointForKeys(waypoints, p.keys);
  const farFromCheckpoint = target ? haversineKm(displayPos, target) >= QUIZ_MISS_DISTANT_KM : false;
  const name = latest.playerName || p.name;
  if (farFromCheckpoint) {
    return `${name} missed a quiz and was moved to a random location — they’re making their way back toward the hunt.`;
  }
  return `${name} missed a quiz and was moved ~2 km away — heading back to the checkpoint to try again.`;
}

function latestChallengeForPlayer(challenges: ChallengeEvent[], playerId: string): ChallengeEvent | null {
  const list = challenges.filter((c) => c.playerId === playerId);
  if (list.length === 0) return null;
  list.sort((a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime());
  return list[0] ?? null;
}

const ACTIVITY_ICON: Record<NonNullable<AvatarActivity>, string> = {
  quiz: "quiz",
  sos: "emergency",
  stop: "pause_circle",
  rest: "hotel",
  refuel: "local_gas_station",
};

/** Icon for constraint stop marker on map (refuel = gas, rest/rejuvenate = spa). */
const CONSTRAINT_STOP_ICON: Record<NonNullable<ConstraintState["kind"]>, string> = {
  refuel: "local_gas_station",
  rest: "spa",
  rejuvenate: "spa",
};

/** Constraint-type activities (stop/rest/refuel/sos) get urgent styling on the map to match in-app STOP panel. */
const ACTIVITY_IS_CONSTRAINT: Record<NonNullable<AvatarActivity>, boolean> = {
  quiz: false,
  sos: true,
  stop: true,
  rest: true,
  refuel: true,
};

/** Create a small marker element for a constraint stop (refuel/rest/rejuvenate) on the map. */
function makeConstraintStopMarkerEl(
  kind: "refuel" | "rest" | "rejuvenate",
  playerName: string,
  color: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.borderRadius = "8px";
  el.style.background = "rgba(255,255,255,0.95)";
  el.style.border = `2px solid ${color}`;
  el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.cursor = "default";
  el.title = `${playerName} → ${kind === "refuel" ? "Refuel" : kind === "rest" ? "Rest" : "Relax"}`;
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.style.fontSize = "18px";
  icon.style.color = "#0F172A";
  icon.textContent = CONSTRAINT_STOP_ICON[kind];
  el.appendChild(icon);
  return el;
}

function makeBroadcastMarkerEl(player: BroadcastPlayer, color: string): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = "40px";
  container.style.height = "40px";
  container.style.position = "relative";
  container.style.overflow = "visible";
  container.style.zIndex = "10";
  container.style.boxSizing = "border-box";
  container.setAttribute("data-broadcast-marker", "1");

  // Debug: center dot to verify anchor alignment with route line.
  const centerDot = document.createElement("div");
  centerDot.setAttribute("data-center-dot", "1");
  centerDot.style.position = "absolute";
  centerDot.style.left = "50%";
  centerDot.style.top = "50%";
  centerDot.style.width = "4px";
  centerDot.style.height = "4px";
  centerDot.style.borderRadius = "9999px";
  centerDot.style.transform = "translate(-50%, -50%)";
  centerDot.style.background = "rgba(34,211,238,0.9)";
  centerDot.style.boxShadow = "0 0 0 2px rgba(15,23,42,0.65)";
  centerDot.style.pointerEvents = "none";
  container.appendChild(centerDot);

  // Status pill above avatar — matches in-app STOP panel language (STOP / REST / REFUEL / SOS); content updated by effect
  const statusPill = document.createElement("div");
  statusPill.setAttribute("data-broadcast-status-pill", "1");
  statusPill.style.position = "absolute";
  statusPill.style.left = "50%";
  statusPill.style.transform = "translateX(-50%)";
  statusPill.style.top = "-14px";
  statusPill.style.whiteSpace = "nowrap";
  statusPill.style.fontSize = "11px";
  statusPill.style.fontWeight = "900";
  statusPill.style.letterSpacing = "0.06em";
  statusPill.style.padding = "4px 8px";
  statusPill.style.borderRadius = "6px";
  statusPill.style.background = "rgba(15,23,42,0.92)";
  statusPill.style.color = "#fff";
  statusPill.style.border = "1px solid rgba(255,255,255,0.25)";
  statusPill.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
  statusPill.style.display = "none";
  statusPill.style.alignItems = "center";
  statusPill.style.gap = "4px";
  statusPill.style.flexDirection = "row";
  statusPill.style.pointerEvents = "none";
  container.appendChild(statusPill);

  const rotateWrap = document.createElement("div");
  rotateWrap.style.width = "40px";
  rotateWrap.style.height = "40px";
  rotateWrap.style.position = "relative";
  rotateWrap.style.overflow = "visible";
  rotateWrap.style.transition = "transform 0.6s ease-out";
  rotateWrap.style.willChange = "transform";
  rotateWrap.style.transformOrigin = "50% 50%";
  rotateWrap.setAttribute("data-marker-rotate", "1");
  container.appendChild(rotateWrap);

  const modeBadge = document.createElement("div");
  modeBadge.setAttribute("data-broadcast-travel-badge-wrap", "1");
  modeBadge.style.position = "absolute";
  modeBadge.style.right = "-5px";
  modeBadge.style.bottom = "-5px";
  modeBadge.style.width = "22px";
  modeBadge.style.height = "22px";
  modeBadge.style.borderRadius = "9999px";
  modeBadge.style.background = "rgba(255,255,255,0.95)";
  modeBadge.style.border = "1px solid rgba(226,232,240,1)";
  modeBadge.style.boxShadow = "0 6px 16px rgba(15,23,42,0.22)";
  modeBadge.style.display = "grid";
  modeBadge.style.placeItems = "center";
  modeBadge.style.pointerEvents = "none";
  modeBadge.style.zIndex = "12";
  const modeIcon = document.createElement("span");
  modeIcon.setAttribute("data-broadcast-travel-badge", "1");
  modeIcon.className = "material-symbols-outlined";
  modeIcon.style.fontSize = "14px";
  modeIcon.style.color = "#0F172A";
  modeIcon.textContent = travelIcon(player.travelMode);
  modeBadge.appendChild(modeIcon);
  container.appendChild(modeBadge);

  if (player.avatarUrl) {
    const avatarEl = makeAvatarEl(player.avatarUrl, color);
    avatarEl.style.width = "40px";
    avatarEl.style.height = "40px";
    avatarEl.setAttribute("data-broadcast-avatar", "1");
    rotateWrap.appendChild(avatarEl);
  } else {
    const fallback = document.createElement("div");
    fallback.style.width = "40px";
    fallback.style.height = "40px";
    fallback.style.borderRadius = "9999px";
    fallback.style.border = `3px solid ${color}`;
    fallback.style.boxShadow = "0 8px 20px rgba(15,23,42,0.25)";
    fallback.style.background = "#0F172A";
    fallback.style.color = "#fff";
    fallback.style.display = "grid";
    fallback.style.placeItems = "center";
    fallback.style.fontSize = "14px";
    fallback.style.fontWeight = "900";
    fallback.textContent = player.name.slice(0, 2).toUpperCase();
    fallback.setAttribute("data-broadcast-avatar", "1");
    rotateWrap.appendChild(fallback);
  }

  return container;
}

/** Update status pill DOM for a marker from current player state. Constraint (STOP/REST/SOS) gets urgent styling to match in-app panel. */
function updateMarkerStatusPill(
  marker: { getElement?: () => HTMLElement | undefined },
  activity: AvatarActivity
): void {
  const el = marker?.getElement?.();
  const pill = el?.querySelector?.("[data-broadcast-status-pill]") as HTMLElement | null;
  if (!pill) return;
  if (!activity) {
    pill.style.display = "none";
    pill.style.animation = "none";
    return;
  }
  pill.style.display = "grid";
  pill.style.left = "auto";
  pill.style.right = "-6px";
  pill.style.top = "-6px";
  pill.style.transform = "none";
  pill.style.width = "22px";
  pill.style.height = "22px";
  pill.style.padding = "0";
  pill.style.borderRadius = "9999px";
  pill.style.placeItems = "center";
  const isConstraint = ACTIVITY_IS_CONSTRAINT[activity];
  if (activity === "sos") {
    pill.style.background = "rgba(220,38,38,0.95)";
    pill.style.borderColor = "rgba(254,226,226,0.5)";
    pill.style.boxShadow = "0 2px 12px rgba(220,38,38,0.5)";
    pill.style.animation = "broadcast-pill-pulse-sos 1.2s ease-in-out infinite";
  } else if (isConstraint) {
    pill.style.background = "rgba(180,83,9,0.95)";
    pill.style.borderColor = "rgba(254,243,199,0.5)";
    pill.style.boxShadow = "0 2px 12px rgba(180,83,9,0.4)";
    pill.style.animation = "broadcast-pill-pulse 1.5s ease-in-out infinite";
  } else {
    pill.style.background = "rgba(15,23,42,0.92)";
    pill.style.borderColor = "rgba(255,255,255,0.25)";
    pill.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
    pill.style.animation = "none";
  }
  pill.style.color = "#fff";
  const label = ACTIVITY_LABEL[activity];
  const iconName = ACTIVITY_ICON[activity];
  pill.textContent = "";
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.style.fontSize = "14px";
  icon.textContent = iconName;
  pill.appendChild(icon);
}

function updateBroadcastTravelBadge(
  marker: { getElement?: () => HTMLElement | undefined },
  modeId: string
): void {
  const el = marker?.getElement?.();
  const icon = el?.querySelector?.("[data-broadcast-travel-badge]") as HTMLElement | null;
  if (icon) icon.textContent = travelIcon(modeId);
}

export default function BroadcastPage() {
  const params = useParams<{ huntId: string }>();
  const huntIdRaw = params?.huntId;
  const huntId =
    typeof huntIdRaw === "string"
      ? huntIdRaw
      : Array.isArray(huntIdRaw)
        ? huntIdRaw[0]
        : "";

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  /** Which player ids have markers on the current map — must reset when the map instance is recreated. */
  const renderedPlayerIdsRef = useRef<Set<string>>(new Set());
  const markerAvatarUrlRef = useRef<Record<string, string>>({});
  const lastFitBoundsCountRef = useRef<number>(0);
  const constraintStopMarkersRef = useRef<Record<string, any>>({});
  /** Destination pin (quiz / travel / stop) for the focused player — same visual language as hunts. */
  const focusedDestPinMarkerRef = useRef<any>(null);
  const focusedDestPinColorRef = useRef<FocusDestPinColor | null>(null);
  const focusedDestPinLastLngLatRef = useRef<[number, number] | null>(null);
  const avatarByUserIdRef = useRef<Record<string, string | null>>({});
  const previousPlayersRef = useRef<Record<string, BroadcastPlayer>>({});
  const seenMomentIdsRef = useRef<Set<string>>(new Set());
  /** Debounce rapid Realtime player_positions events before re-running snapshot. */
  const realtimeSnapshotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [hunt, setHunt] = useState<{
    id: string;
    title: string;
    keys_to_win: number;
    hunt_location: string | null;
    region_name: string | null;
    waypoints: Array<{ label?: string; lng: number; lat: number }> | null;
    questions: Array<{ id?: string; category?: string }>;
  } | null>(null);
  /** Map framing from hunt state/region — never from clue waypoints. */
  const [regionMapView, setRegionMapView] = useState<RegionMapView | null>(null);
  /** Synthetic / spread spawn base in DB units — matches region map center. */
  const regionSpawnBaseRef = useRef<LngLat>({ ...DEFAULT_CENTER });
  const [players, setPlayers] = useState<BroadcastPlayer[]>([]);
  /** Always-current `players` for RAF / polls (must be declared before any effect that reads it). */
  const playersRef = useRef<BroadcastPlayer[]>([]);
  playersRef.current = players;
  /**
   * Dedupe layout jumpTo for the same focus target — must include camera fields so when `map_zoom` /
   * `map_width_px` arrive on a later poll we snap again (otherwise idle RAF never updates zoom).
   */
  const lastFocusLayoutJumpKeyRef = useRef<string>("");
  const [challenges, setChallenges] = useState<ChallengeEvent[]>([]);
  const [moments, setMoments] = useState<BroadcastMoment[]>([]);
  const [activeToast, setActiveToast] = useState<BroadcastMoment | null>(null);
  const toastQueueRef = useRef<BroadcastMoment[]>([]);
  const enqueueToast = useCallback((moment: BroadcastMoment) => {
    setActiveToast((cur) => {
      if (!cur) return moment;
      toastQueueRef.current.push(moment);
      return cur;
    });
  }, []);
  /** Bumps periodically so “other players” feed re-reads interpolated map positions. */
  const [mapActivityTick, setMapActivityTick] = useState(0);
  const [otherFeedIndex, setOtherFeedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True after first successful read when `player_positions` had zero rows for this hunt (broadcast has nothing to sync from DB). */
  const [playerPositionsTableEmpty, setPlayerPositionsTableEmpty] = useState<boolean | null>(null);
  const [focusPlayerId, setFocusPlayerId] = useState<string>("");
  // Keep latest focus in a ref so polled snapshot uses the current selection.
  const focusPlayerIdRef = useRef<string>("");
  focusPlayerIdRef.current = focusPlayerId;
  /** Re-render periodically while a player is focused so spotlight uses fresh `lastDisplayedPosRef` (RAF-driven). */
  const [focusPosTick, setFocusPosTick] = useState(0);
  /** Drives on-air quiz countdown UI. */
  const [quizBroadcastTick, setQuizBroadcastTick] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Fixed schedule: we show one player for 60 seconds, unless a newer event forces a jump.
  const focusSwitchEndsAtRef = useRef<number>(0);
  const didAutoStartRef = useRef<boolean>(false);
  /** User picked "Show all on map" — keep map framing all avatars; do not auto-jump spotlight to quiz. */
  /** Default: show everyone on the map until someone starts moving (no spotlight rotation). */
  const showAllModePreferredRef = useRef(true);
  /**
   * User explicitly chose someone in the dropdown (not "Show all").
   * While true, round-robin, quiz spotlight, and moment-driven jumps must not change focus — fixes "I picked Lagos but it snaps back to Ogun".
   */
  const userPinnedFocusPlayerRef = useRef(false);
  /** One quiz-taker at a time when several are at the checkpoint — no rotation until they finish. */
  const quizSpotlightHoldRef = useRef(false);
  const quizSpotlightLockedPlayerIdRef = useRef<string | null>(null);

  // Detect mobile so we recenter map on avatar (center + zoom) instead of fitBounds — path then matches screen
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load hunt shell first; resolve map frame from hunt state/region (not waypoints); then poll DB.
  useEffect(() => {
    if (!huntId || !supabase) {
      setLoading(false);
      setRegionMapView(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRegionMapView(null);

    (async () => {
      try {
        let huntRes = await supabase
          .from("hunts")
          .select("id, title, keys_to_win, region_name, hunt_location, waypoints, questions")
          .eq("id", huntId)
          .eq("status", "active")
          .maybeSingle();

        if (
          huntRes.error &&
          isSupabaseMissingColumnError(huntRes.error)
        ) {
          huntRes = await supabase
            .from("hunts")
            .select("id, title, keys_to_win, region_name, waypoints, questions")
            .eq("id", huntId)
            .eq("status", "active")
            .maybeSingle();
        }

        if (cancelled) return;
        const huntErr = huntRes.error;
        const huntData = huntRes.data;
        if (huntErr || !huntData) {
          const hint =
            huntErr && !isSupabaseMissingColumnError(huntErr)
              ? ` ${String((huntErr as { message?: string }).message ?? "")}`
              : "";
          setError(
            huntErr && isSupabaseMissingColumnError(huntErr)
              ? `Database is missing hunt columns (e.g. region_name / waypoints). Run migrations in database_migrations/.`
              : `Hunt not found or not active.${hint}`
          );
          setRegionMapView(null);
          setLoading(false);
          return;
        }

        const row = huntData as Record<string, unknown>;
        const hunt_location =
          typeof row.hunt_location === "string" ? row.hunt_location.trim() || null : null;
        const region_name =
          typeof row.region_name === "string" ? row.region_name.trim() || null : null;

        let view: RegionMapView;
        try {
          view = await fetchRegionMapViewForHuntCached(
            String(huntData.id),
            hunt_location,
            region_name
          );
        } catch {
          view = await fetchRegionMapViewForQuery(null);
        }
        if (cancelled) return;

        regionSpawnBaseRef.current = { ...view.center };

        setHunt({
          id: String(huntData.id),
          title: String(huntData.title ?? ""),
          keys_to_win: (huntData.keys_to_win as number) ?? 0,
          hunt_location,
          region_name,
          waypoints: Array.isArray(row.waypoints)
            ? (row.waypoints as Array<{ label?: string; lng: number; lat: number }>)
            : null,
          questions: Array.isArray(huntData.questions) ? huntData.questions : [],
        });
        setRegionMapView(view);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg ? `Failed to load broadcast: ${msg}` : "Failed to load broadcast.");
          setRegionMapView(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [huntId]);

  // Reset auto spotlight state when switching hunts.
  useEffect(() => {
    didAutoStartRef.current = false;
    showAllModePreferredRef.current = true;
    userPinnedFocusPlayerRef.current = false;
    focusSwitchEndsAtRef.current = 0;
    quizSpotlightHoldRef.current = false;
    quizSpotlightLockedPlayerIdRef.current = null;
    setFocusPlayerId("");
    setPlayerPositionsTableEmpty(null);
  }, [huntId]);

  useEffect(() => {
    if (!focusPlayerId) return;
    const t = window.setInterval(() => setFocusPosTick((n) => n + 1), 450);
    return () => window.clearInterval(t);
  }, [focusPlayerId]);

  useEffect(() => {
    if (players.length < 2) return;
    const t = window.setInterval(() => setMapActivityTick((n) => n + 1), 1600);
    return () => window.clearInterval(t);
  }, [players.length]);

  const loadBroadcastSnapshot = useCallback(
    async (isInitial = false) => {
      if (!huntId || !supabase || !hunt) return;

      let posRes = await supabase
        .from("player_positions")
        .select(PLAYER_POSITIONS_SELECT_FULL)
        .eq("hunt_id", huntId);
      if (posRes.error && isSupabaseMissingColumnError(posRes.error)) {
        posRes = await supabase
          .from("player_positions")
          .select(PLAYER_POSITIONS_SELECT_CORE)
          .eq("hunt_id", huntId);
      }
      if (posRes.error && isSupabaseMissingColumnError(posRes.error)) {
        posRes = await supabase
          .from("player_positions")
          .select(PLAYER_POSITIONS_SELECT_LEGACY)
          .eq("hunt_id", huntId);
      }
      if (posRes.error) throw posRes.error;
      setPlayerPositionsTableEmpty((posRes.data ?? []).length === 0);

      let respRes = await supabase
        .from("question_responses")
        .select(QUESTION_RESPONSES_SELECT_FULL)
        .eq("hunt_id", huntId)
        .order("answered_at", { ascending: false })
        .limit(20);
      if (respRes.error && isSupabaseMissingColumnError(respRes.error)) {
        respRes = await supabase
          .from("question_responses")
          .select(QUESTION_RESPONSES_SELECT_LEGACY)
          .eq("hunt_id", huntId)
          .order("answered_at", { ascending: false })
          .limit(20);
      }
      if (respRes.error) throw respRes.error;

      const actionRes = await supabase
        .from("hunt_player_actions")
        .select("id, player_id, player_name, action_type, payload, created_at")
        .eq("hunt_id", huntId)
        .order("created_at", { ascending: false })
        .limit(120);

      if (actionRes.error && !isSupabaseMissingTableError(actionRes.error)) {
        throw actionRes.error;
      }

      let posData = (posRes.data ?? []) as any[];
      const respData = (respRes.data ?? []) as any[];
      const actionData = (actionRes.error ? [] : (actionRes.data ?? [])) as any[];

      // Registered but no player_positions row — spawn near hunt state/region center (not clue waypoints).
      {
        const spawnLng = regionSpawnBaseRef.current.lng;
        const spawnLat = regionSpawnBaseRef.current.lat;
        const { data: regRows, error: regRowsErr } = await supabase
          .from("hunt_registrations")
          .select("player_id")
          .eq("hunt_id", huntId);
        if (!regRowsErr && regRows?.length) {
          const havePos = new Set(posData.map((p) => String(p.player_id)));
          const regIds = (regRows as Array<{ player_id: unknown }>).map((r) =>
            String(r?.player_id ?? "").trim()
          ).filter(Boolean);
          const missing = Array.from(new Set(regIds)).filter((id) => !havePos.has(id));
          if (missing.length > 0) {
            const { data: profs } = await supabase
              .from("player_profiles")
              .select("user_id, username, avatar_url")
              .in("user_id", missing);
            const nameBy = new Map(
              (profs ?? []).map((p: { user_id: string; username?: string }) => [
                String(p.user_id),
                (typeof p.username === "string" && p.username.trim()) || "Loota",
              ])
            );
            for (const id of missing) {
              posData.push({
                player_id: id,
                player_name: nameBy.get(id) ?? "Loota",
                lng: spawnLng,
                lat: spawnLat,
                keys: 0,
                travel_mode: "walk",
                travel_started_at: null,
                travel_route_coords: null,
                travel_duration_ms: null,
                answering_question: false,
                current_question: null,
                question_deadline_at: null,
                updated_at: new Date().toISOString(),
                last_active_at: null,
                constraint_state: null,
                narrator_state: null,
                map_zoom: null,
                map_width_px: null,
              });
            }
          }
        }
        // Broadcast uses DB lng/lat as-is (no pre-game km-scale spread — that hid the real route).
      }

      // Travel shadow: use player_positions as the most reliable immediate source.
      // Hunts upserts travel_started_at + travel_route_coords + travel_duration_ms at the same time the user clicks Go/Rent/Board,
      // so broadcast can animate smoothly without waiting for the next actions poll.
      {
        const nowMs = Date.now();
        const shadowRef = travelShadowByPlayerIdRef.current;
        for (const row of posData) {
          const pid = String(row.player_id);
          const routeCoords = normalizeTravelRouteCoords(row.travel_route_coords);
          const startedAtMs = parseTimestampMs(row.travel_started_at);
          const durationMs = parseDurationMs(row.travel_duration_ms);
          const hasActiveTravel =
            startedAtMs > 0 &&
            durationMs != null &&
            durationMs > 0 &&
            nowMs <= startedAtMs + durationMs + INACTIVE_FREEZE_GRACE_MS;
          const dbPos = { lng: Number(row.lng), lat: Number(row.lat) };
          // Always store raw DB route coords (same source as drawn line) so avatar follows the path.
          if (routeCoords && routeCoords.length >= 2) {
            dbRouteCoordsRef.current[pid] = routeCoords;
            const startPt = routeCoords[0];
            // Not actively traveling: use canonical DB position. Do not pin marker to route start/end,
            // otherwise players with identical DB coords can appear artificially spread on broadcast.
            if (!hasActiveTravel) {
              lastRoutePosByPlayerIdRef.current[pid] = dbPos;
              lastDisplayedPosRef.current[pid] = dbPos;
              const focused = focusPlayerIdRef.current;
              // Only log for the focused player.
              if (!hasLoggedBroadcastStartRef.current && focused && pid === focused) {
                hasLoggedBroadcastStartRef.current = true;
                const noTravelPayload = {
                  source: "broadcast",
                  kind: "avatar_position_no_active_travel",
                  huntId,
                  playerId: pid,
                  // What broadcast will use when not traveling (DB position).
                  dbPos,
                  positionSource: "db_pos",
                  routeDerivedPos: { lng: startPt[0], lat: startPt[1] },
                  routeFirstPoint: { lng: startPt[0], lat: startPt[1] },
                  routeLength: routeCoords.length,
                };
                fetch("/api/debug-log-position", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(noTravelPayload) }).catch(() => {});
              }
            }
          } else {
            delete dbRouteCoordsRef.current[pid];
          }
          // If there's no route, still log DB position for the focused player.
          if (!routeCoords || routeCoords.length < 2) {
            const focused = focusPlayerIdRef.current;
            if (!hasLoggedBroadcastStartRef.current && focused && pid === focused) {
              hasLoggedBroadcastStartRef.current = true;
              const payload = {
                source: "broadcast",
                kind: "focused_db_pos",
                huntId,
                playerId: pid,
                dbPos: { lng: Number(row.lng), lat: Number(row.lat) },
              };
              fetch("/api/debug-log-position", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }).catch(() => {});
            }
          }
          const constraintState = parseConstraintState(row.constraint_state);
          const inStopDecisionFlow =
            constraintState &&
            (constraintState.status === "relaxing" || constraintState.status === "ready_to_pay");
          // Only drop travel shadow for stop UI when there is no active leg in DB — stale relaxing/pay
          // rows were wiping shadow while travel_* was still set, snapping avatars to waypoints.
          if (
            constraintState &&
            (constraintState.status === "relaxing" || constraintState.status === "ready_to_pay") &&
            !hasActiveTravel
          ) {
            shadowRef[pid] = null;
            continue;
          }
          const modeId = typeof row.travel_mode === "string" && row.travel_mode ? row.travel_mode : "walk";
          if (hasActiveTravel && routeCoords && routeCoords.length >= 2 && !inStopDecisionFlow) {
            shadowRef[pid] = {
              modeId,
              startedAtMs,
              durationMs,
              routeCoords,
              pausedAtMs: null,
              sourceActionAtMs: Date.now(),
            };
            const startPos = { lng: routeCoords[0][0], lat: routeCoords[0][1] };
            lastRoutePosByPlayerIdRef.current[pid] = startPos;
            lastDisplayedPosRef.current[pid] = startPos;
            const focused = focusPlayerIdRef.current;
            if (!hasLoggedBroadcastStartRef.current && focused && pid === focused) {
              hasLoggedBroadcastStartRef.current = true;
              const activeTravelPayload = {
                source: "broadcast",
                kind: "avatar_start_active_travel",
                huntId,
                playerId: pid,
                dbPos: { lng: Number(row.lng), lat: Number(row.lat) },
                startPos: { lng: startPos.lng, lat: startPos.lat },
                routeFirstPoint: { lng: routeCoords[0][0], lat: routeCoords[0][1] },
                routeLength: routeCoords.length,
              };
              fetch("/api/debug-log-position", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(activeTravelPayload) }).catch(() => {});
            }
            const marker = markersRef.current[pid];
            if (marker && typeof marker.setLngLat === "function") marker.setLngLat([startPos.lng, startPos.lat]);
          } else {
            shadowRef[pid] = null;
          }
        }
      }

      const playerIds = [...new Set(posData.map((p) => String(p.player_id)).filter(Boolean))];
      const uncachedIds = playerIds.filter((id) => !(id in avatarByUserIdRef.current));
      if (uncachedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("player_profiles")
          .select("user_id, avatar_url")
          .in("user_id", uncachedIds);
        (profiles ?? []).forEach((pr: any) => {
          avatarByUserIdRef.current[String(pr.user_id)] = pr.avatar_url ?? null;
        });
        uncachedIds.forEach((id) => {
          if (!(id in avatarByUserIdRef.current)) avatarByUserIdRef.current[id] = null;
        });
      }

      const posByPlayerId = new Map<string, any>();
      posData.forEach((p) => posByPlayerId.set(String(p.player_id), p));

      const questions = Array.isArray(hunt.questions) ? hunt.questions : [];
      const getCategory = (qid: string) =>
        questions.find((q: any) => q.id === qid || q.questionId === qid)?.category ?? "Challenge";

      const nextChallenges: ChallengeEvent[] = respData.map((r: any) => ({
        id: r.id,
        playerId: String(r.player_id),
        playerName: posByPlayerId.get(String(r.player_id))?.player_name ?? "Loota",
        category: getCategory(r.question_id),
        questionText: (r.question_text ?? r.question_location ?? null) as string | null,
        playerAnswer: r.answer ?? "",
        correct: Boolean(r.is_correct),
        timeTakenSeconds: typeof r.time_taken_seconds === "number" ? r.time_taken_seconds : null,
        answeredAt: r.answered_at,
      }));
      setChallenges(nextChallenges);

      const latestChallengeByPlayerId = new Map<string, ChallengeEvent>();
      nextChallenges.forEach((challenge) => {
        if (!latestChallengeByPlayerId.has(challenge.playerId)) {
          latestChallengeByPlayerId.set(challenge.playerId, challenge);
        }
      });

      const actionsByPlayerId: Record<string, { lastConstraintChoice: PlayerAction | null; lastConstraintExited: PlayerAction | null }> = {};
      const parsedActions: PlayerAction[] = actionData.map((a: any) => {
        let payload = a.payload ?? undefined;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            payload = undefined;
          }
        }
        return {
          id: String(a.id),
          playerId: String(a.player_id),
          playerName: a.player_name ?? posByPlayerId.get(String(a.player_id))?.player_name ?? "Loota",
          actionType: a.action_type,
          payload,
          createdAt: a.created_at,
        };
      });
      parsedActions.forEach((action) => {
        if (!actionsByPlayerId[action.playerId]) {
          actionsByPlayerId[action.playerId] = { lastConstraintChoice: null, lastConstraintExited: null };
        }
        if (action.actionType === "constraint_choice" && !actionsByPlayerId[action.playerId].lastConstraintChoice) {
          actionsByPlayerId[action.playerId].lastConstraintChoice = action;
        }
        if (action.actionType === "constraint_exited" && !actionsByPlayerId[action.playerId].lastConstraintExited) {
          actionsByPlayerId[action.playerId].lastConstraintExited = action;
        }
      });
      // Travel shadow from polled actions only (no realtime). Only update when the latest action for a player has changed; call Mapbox only for travel_started.
      const latestTravelActionByPlayerId: Record<string, PlayerAction> = {};
      parsedActions.forEach((action) => {
        const pid = action.playerId;
        if (pid in latestTravelActionByPlayerId) return;
        const type = action.actionType;
        if (
          type === "travel_started" ||
          type === "travel_paused" ||
          type === "travel_resumed" ||
          type === "travel_stopped" ||
          type === "travel_ended"
        ) {
          latestTravelActionByPlayerId[pid] = action;
        }
      });
      const processedRef = lastProcessedTravelActionIdByPlayerIdRef.current;
      const shadowRef = travelShadowByPlayerIdRef.current;
      // Prefer stored route (travel_route_coords) from posData so route line and avatar share the same start — never use DB lng/lat as avatar start.
      const posByPid = new Map<string, (typeof posData)[number]>();
      posData.forEach((row: any) => posByPid.set(String(row.player_id), row));
      for (const [pid, action] of Object.entries(latestTravelActionByPlayerId)) {
        const actionId = action.id;
        if (processedRef[pid] === actionId) continue;
        processedRef[pid] = actionId;
        if (
          action.actionType === "travel_stopped" ||
          action.actionType === "travel_ended"
        ) {
          const oldShadow = shadowRef[pid];
          if (oldShadow?.routeCoords && oldShadow.routeCoords.length >= 2) {
            const endPt = oldShadow.routeCoords[oldShadow.routeCoords.length - 1];
            lastRoutePosByPlayerIdRef.current[pid] = { lng: endPt[0], lat: endPt[1] };
          }
          shadowRef[pid] = null;
          continue;
        }
        if (action.actionType === "travel_paused" || action.actionType === "travel_resumed") {
          const shadow = buildTravelShadowFromAction(action);
          if (shadow) shadowRef[pid] = shadow;
          continue;
        }
        if (action.actionType === "travel_started") {
          const row = posByPid.get(pid);
          const storedRoute = row ? normalizeTravelRouteCoords(row.travel_route_coords) : null;
          const useStoredRoute = storedRoute && storedRoute.length >= 2;
          let shadow: TravelShadowState | null = null;
          if (useStoredRoute && row) {
            const startedAtMs = parseTimestampMs(row.travel_started_at);
            const durationMs = parseDurationMs(row.travel_duration_ms);
            const modeId = typeof row.travel_mode === "string" && row.travel_mode ? row.travel_mode : "walk";
            if (startedAtMs > 0 && durationMs && durationMs > 0) {
              shadow = {
                modeId,
                startedAtMs,
                durationMs,
                routeCoords: storedRoute,
                pausedAtMs: null,
                sourceActionAtMs: Date.now(),
              };
            }
          }
          if (!shadow) {
            const payloadShadow = buildTravelShadowFromAction(action);
            if (payloadShadow) {
              shadow = {
                ...payloadShadow,
                startedAtMs: Math.min(payloadShadow.startedAtMs, Date.now()),
              };
            } else {
              const from = parseFromTo(action.payload?.from);
              const to = parseFromTo(action.payload?.to);
              const modeId = (action.payload?.modeId as string) ?? "walk";
              const startedAtMs = parseTimestampMs(action.payload?.startedAt) || parseTimestampMs(action.createdAt);
              if (from && to && startedAtMs > 0) {
                shadow = buildStubTravelShadow(from, to, startedAtMs, modeId);
              }
            }
          }
          if (shadow) {
            travelShadowByPlayerIdRef.current[pid] = shadow;
            const startPos = { lng: shadow.routeCoords[0][0], lat: shadow.routeCoords[0][1] };
            lastRoutePosByPlayerIdRef.current[pid] = startPos;
            lastDisplayedPosRef.current[pid] = startPos;
            const marker = markersRef.current[pid];
            if (marker && typeof marker.setLngLat === "function") marker.setLngLat([startPos.lng, startPos.lat]);
          }
        }
      }

      const nextPlayers: BroadcastPlayer[] = posData.map((p: any) => {
        const playerId = String(p.player_id);
        const actionState = actionsByPlayerId[playerId];
        const startedAtMs = parseTimestampMs(p.travel_started_at);
        const durationMs = parseDurationMs(p.travel_duration_ms);
        const routeCoords = normalizeTravelRouteCoords(p.travel_route_coords);
        const lastActiveAtMs = parseTimestampMs(p.last_active_at) || parseTimestampMs(p.updated_at);
        const deadlineMs = parseTimestampMs(p.question_deadline_at);
        // Avatar position normally comes from DB (player_positions.lng/lat). When unset/invalid (e.g. null, 0,0),
        // fall back to the hunt region spawn base so "Show all" doesn't drop the player entirely.
        const rawLng = Number(p.lng);
        const rawLat = Number(p.lat);
        const looksUnset = Math.abs(rawLng) < 1e-6 && Math.abs(rawLat) < 1e-6;
        const looksValid =
          Number.isFinite(rawLng) &&
          Number.isFinite(rawLat) &&
          Math.abs(rawLat) <= 90 &&
          Math.abs(rawLng) <= 180 &&
          !looksUnset;
        const spawn = regionSpawnBaseRef.current;
        const canonicalPos = looksValid ? { lng: rawLng, lat: rawLat } : { lng: spawn.lng, lat: spawn.lat };
        const mz = p.map_zoom;
        const mw = p.map_width_px;
        return {
          id: playerId,
          name: p.player_name || "Loota",
          avatarUrl: avatarByUserIdRef.current[playerId] ?? null,
          pos: canonicalPos,
          keys: p.keys ?? 0,
          keysToWin: hunt.keys_to_win ?? 0,
          travelMode: p.travel_mode || "walk",
          answeringQuestion: Boolean(p.answering_question),
          currentQuestionText: typeof p.current_question === "string" ? p.current_question : null,
          questionDeadlineAtMs: deadlineMs > 0 ? deadlineMs : null,
          updatedAt: p.updated_at ?? "",
          constraintState: parseConstraintState(p.constraint_state),
          narratorState: parseNarratorState(p.narrator_state),
          lastConstraintChoice: actionState?.lastConstraintChoice ?? null,
          lastConstraintExited: actionState?.lastConstraintExited ?? null,
          mapZoom: typeof mz === "number" && Number.isFinite(mz) ? mz : null,
          mapWidthPx: typeof mw === "number" && Number.isFinite(mw) && mw > 0 ? Math.round(mw) : null,
          travelStartedAtMs: startedAtMs,
          travelDurationMs: durationMs,
          travelRouteCoords: routeCoords,
          lastActiveAtMs,
        };
      });

      const quizStartMoments: BroadcastMoment[] = [];
      nextPlayers.forEach((player) => {
        const prev = previousPlayersRef.current[player.id];
        const hadQuiz =
          Boolean(prev?.answeringQuestion) || Boolean(prev?.currentQuestionText?.trim());
        const hasQuiz =
          Boolean(player.answeringQuestion) || Boolean(player.currentQuestionText?.trim());
        if (hasQuiz && !hadQuiz && broadcastActivelyAtQuiz(player, player.pos, hunt.waypoints)) {
          // Stable id so poll snapshots don’t recreate “unseen” moments and steal focus every few seconds.
          quizStartMoments.push({
            id: `quiz-start-${player.id}`,
            playerId: player.id,
            playerName: player.name,
            title: `${player.name} reached a quiz`,
            body: player.currentQuestionText ?? "A challenge question is on screen.",
            createdAt: player.updatedAt || new Date().toISOString(),
            tone: "info",
          });
        }
      });
      previousPlayersRef.current = Object.fromEntries(nextPlayers.map((player) => [player.id, player]));
      setPlayers(nextPlayers);

      const nextMoments = [
        ...parsedActions.map(buildActionMoment).filter(Boolean) as BroadcastMoment[],
        ...nextChallenges.map(buildChallengeMoment),
        ...quizStartMoments,
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12);

      setMoments(nextMoments);

      if (isInitial) {
        nextMoments.forEach((moment) => seenMomentIdsRef.current.add(moment.id));
      } else {
        const unseen = nextMoments.filter((moment) => !seenMomentIdsRef.current.has(moment.id));
        unseen.forEach((moment) => seenMomentIdsRef.current.add(moment.id));
        if (unseen.length > 0) {
          const unseenNewestFirst = [...unseen].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          unseenNewestFirst.forEach((moment) => enqueueToast(moment));
          // Only jump spotlight when the current 1 min slot has finished (manual dropdown still always works).
          const newest = unseenNewestFirst[0];
          const slotDone =
            focusSwitchEndsAtRef.current === 0 || Date.now() >= focusSwitchEndsAtRef.current;
          const multiActiveQuiz =
            nextPlayers.filter((pl) => broadcastActivelyAtQuiz(pl, pl.pos, hunt.waypoints)).length > 1;
          const isQuizStartMoment = Boolean(newest?.id?.startsWith("quiz-start-"));
          const skipAutoJumpForQuizGridlock = isQuizStartMoment && multiActiveQuiz;
          if (
            newest?.playerId &&
            slotDone &&
            !skipAutoJumpForQuizGridlock &&
            !showAllModePreferredRef.current &&
            !userPinnedFocusPlayerRef.current &&
            anyBroadcastPlayerStartedMoving(nextPlayers)
          ) {
            didAutoStartRef.current = true;
            focusSwitchEndsAtRef.current = Date.now() + AUTO_FOCUS_MS;
            setFocusPlayerId(newest.playerId);
          }
        }
      }
    },
    [focusPlayerId, hunt, huntId, enqueueToast]
  );

  const applyIncomingAction = useCallback(
    (row: any) => {
      if (!row) return;
      let payload = row.payload ?? undefined;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          payload = undefined;
        }
      }
      const action: PlayerAction = {
        id: String(row.id),
        playerId: String(row.player_id),
        playerName: row.player_name ?? "Loota",
        actionType: row.action_type,
        payload,
        createdAt: row.created_at ?? new Date().toISOString(),
      };

      if (action.actionType === "travel_paused" || action.actionType === "travel_resumed") {
        const playerId = action.playerId;
        const existing = travelShadowByPlayerIdRef.current[playerId];
        const player = playersRef.current.find((pl) => String(pl.id) === String(playerId));
        const storedRoute = dbRouteCoordsRef.current[playerId];
        const actionShadow = buildTravelShadowFromAction(action);

        const routeCoords =
          actionShadow?.routeCoords && actionShadow.routeCoords.length >= 2
            ? actionShadow.routeCoords
            : storedRoute && storedRoute.length >= 2
              ? storedRoute
              : player?.travelRouteCoords && player.travelRouteCoords.length >= 2
                ? player.travelRouteCoords
                : existing?.routeCoords && existing.routeCoords.length >= 2
                  ? existing.routeCoords
                  : null;

        const startedFromPlayer = player?.travelStartedAtMs ?? 0;
        const startedAtMs =
          actionShadow?.startedAtMs ??
          existing?.startedAtMs ??
          (startedFromPlayer > 0
            ? startedFromPlayer
            : (parseTimestampMs(action.payload?.startedAt) || parseTimestampMs(action.createdAt)));

        const durationMs =
          actionShadow?.durationMs ??
          existing?.durationMs ??
          Number(player?.travelDurationMs ?? 0);

        if (routeCoords && routeCoords.length >= 2 && startedAtMs > 0 && durationMs > 0) {
          const pausedAtMs =
            action.actionType === "travel_paused"
              ? parseTimestampMs(action.payload?.pausedAt) || Date.now()
              : null;
          const modeId =
            (action.payload?.modeId as string) ??
            actionShadow?.modeId ??
            existing?.modeId ??
            player?.travelMode ??
            "walk";
          travelShadowByPlayerIdRef.current[playerId] = {
            modeId,
            startedAtMs,
            durationMs,
            routeCoords,
            pausedAtMs,
            sourceActionAtMs: parseTimestampMs(action.createdAt) || Date.now(),
          };
        }
      } else if (
        action.actionType === "travel_stopped" ||
        action.actionType === "travel_ended"
      ) {
        // Keep actions feed for moments only; player_positions snapshot is the sole source for travel paths.
        // On stop/end, clear any residual shadow immediately to avoid stale off-route interpolation.
        travelShadowByPlayerIdRef.current[action.playerId] = null;
      }

      setPlayers((prev) =>
        prev.map((player) => {
          if (player.id !== action.playerId) return player;
          if (action.actionType === "constraint_choice") {
            return { ...player, lastConstraintChoice: action };
          }
          if (action.actionType === "constraint_exited") {
            return { ...player, lastConstraintExited: action };
          }
          return player;
        })
      );

      const moment = buildActionMoment(action);
      if (!moment) return;
      setMoments((prev) =>
        [moment, ...prev.filter((m) => m.id !== moment.id)]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 12)
      );
      if (!seenMomentIdsRef.current.has(moment.id)) {
        seenMomentIdsRef.current.add(moment.id);
        enqueueToast(moment);
      }
    },
    [focusPlayerId, enqueueToast]
  );

  // When focus changes, allow a fresh one-time log for the newly focused player.
  useEffect(() => {
    hasLoggedBroadcastStartRef.current = false;
  }, [focusPlayerId]);

  // Before focus snap / follow, drop maxBounds so street-level zoom isn't clamped to a "hunt region" feel.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    try {
      // Do not clamp map movement to Nigeria bbox; off-country players must remain visible.
      map.setMaxBounds(null);
    } catch {
      /* ignore */
    }
  }, [mapReady]);

  /** Hunts page gets layout early; broadcast map sits in flex/min-h-0 and often needs resize to fetch tiles. */
  useEffect(() => {
    if (!mapReady) return;
    const el = mapContainerRef.current;
    const map = mapRef.current;
    if (!el || !map) return;
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    try {
      map.resize();
    } catch {
      /* ignore */
    }
    return () => ro.disconnect();
  }, [mapReady]);

  // Log camera state once when focusing a player (diagnose "same coords, different visuals").
  const hasLoggedBroadcastCameraRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !focusPlayerId) {
      hasLoggedBroadcastCameraRef.current = false;
      return;
    }
    if (hasLoggedBroadcastCameraRef.current) return;
    const map = mapRef.current;
    const current = findBroadcastPlayerByFocusId(playersRef.current, focusPlayerId);
    if (!map?.getCenter || !map?.getZoom || !current) return;
    hasLoggedBroadcastCameraRef.current = true;
    const sendLog = () => {
      try {
        const c = map.getCenter();
        const payload = {
          source: "broadcast",
          kind: "camera_state",
          huntId,
          playerId: focusPlayerId,
          resolvedPlayerId: current!.id,
          position: { lng: current!.pos.lng, lat: current!.pos.lat },
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
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch {}
    };
    if (typeof map.once === "function") {
      map.once("idle", sendLog);
    }
    window.setTimeout(sendLog, 900);
  }, [mapReady, focusPlayerId, players.length]);

  useEffect(() => {
    if (!hunt) return;
    let cancelled = false;
    let firstRun = true;

    const run = async (isInitial = false) => {
      try {
        await loadBroadcastSnapshot(isInitial);
        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
        firstRun = false;
      } catch (e) {
        if (!cancelled && firstRun) {
          const o = e as { message?: string; code?: string };
          const detail = o?.message ? String(o.message) : e instanceof Error ? e.message : "";
          const migrationHint =
            detail && /column|schema cache|PGRST204/i.test(detail)
              ? " Run database_migrations/sync_player_positions_broadcast_columns.sql (and related scripts) in Supabase."
              : "";
          setError(
            detail
              ? `Failed to load broadcast: ${detail}.${migrationHint}`
              : `Failed to load broadcast.${migrationHint}`
          );
          setLoading(false);
        }
      }
    };

    void run(true);
    const interval = window.setInterval(() => void run(false), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hunt?.id, loadBroadcastSnapshot]);

  // Fixed spotlight rotation:
  // - default: show one avatar for 60s, then move to the next (round-robin by keys)
  // - event-driven: when a new moment arrives, jump immediately to that player and reset the 60s timer
  // useLayoutEffect: first paint with players already has a focused id (dropdown doesn’t flash “Show all”).
  useLayoutEffect(() => {
    if (players.length === 0) return;
    // If nothing is focused yet, pick the first avatar and start the 60s round-robin.
    if (focusPlayerId) return;
    if (showAllModePreferredRef.current) return;
    if (didAutoStartRef.current) return; // auto-start already happened
    if (!anyBroadcastPlayerStartedMoving(players)) return;

    const ordered = [...players].sort(
      (a, b) => b.keys - a.keys || a.name.localeCompare(b.name)
    );
    const firstId = ordered[0]?.id;
    if (!firstId) return;
    didAutoStartRef.current = true;
    setFocusPlayerId(firstId);
  }, [players, focusPlayerId]);

  useEffect(() => {
    if (!focusPlayerId) {
      focusSwitchEndsAtRef.current = 0;
      return;
    }
    focusSwitchEndsAtRef.current = Date.now() + AUTO_FOCUS_MS;
  }, [focusPlayerId]);

  useEffect(() => {
    if (!focusPlayerId) return;
    if (!anyBroadcastPlayerStartedMoving(players)) return;

    const tick = () => {
      if (userPinnedFocusPlayerRef.current) return;
      if (!anyBroadcastPlayerStartedMoving(playersRef.current)) return;
      if (quizSpotlightHoldRef.current) return;
      if (Date.now() < focusSwitchEndsAtRef.current) return;
      const list = [...playersRef.current].sort(
        (a, b) => b.keys - a.keys || a.name.localeCompare(b.name)
      );
      if (list.length === 0) return;
      if (list.length === 1) {
        focusSwitchEndsAtRef.current = Date.now() + AUTO_FOCUS_MS;
        return;
      }

      const currId = focusPlayerIdRef.current;
      const idx = list.findIndex((p) => p.id === currId);
      const next = list[(idx >= 0 ? idx + 1 : 1) % list.length] ?? list[0];

      // Advance spotlight and reset the timer.
      focusSwitchEndsAtRef.current = Date.now() + AUTO_FOCUS_MS;
      if (next?.id && next.id !== currId) setFocusPlayerId(next.id);
      didAutoStartRef.current = true;
    };

    const interval = window.setInterval(tick, 1500);
    return () => window.clearInterval(interval);
  }, [focusPlayerId, players]);

  useEffect(() => {
    const t = window.setInterval(() => setQuizBroadcastTick((n) => n + 1), 400);
    return () => window.clearInterval(t);
  }, []);

  /** When several lootas are at the quiz waypoint, pick one at random and keep focus until they finish (no A↔B thrashing). */
  useEffect(() => {
    if (userPinnedFocusPlayerRef.current) {
      return;
    }
    if (showAllModePreferredRef.current) {
      quizSpotlightHoldRef.current = false;
      quizSpotlightLockedPlayerIdRef.current = null;
      return;
    }
    if (!anyBroadcastPlayerStartedMoving(players)) {
      quizSpotlightHoldRef.current = false;
      quizSpotlightLockedPlayerIdRef.current = null;
      return;
    }
    const wps = hunt?.waypoints;
    // Use DB position only here (ref is declared later in this component; at-quiz players are typically stationary).
    const candidates = players.filter((p) => broadcastActivelyAtQuiz(p, p.pos, wps));
    const ids = candidates.map((c) => c.id);
    if (ids.length === 0) {
      quizSpotlightHoldRef.current = false;
      quizSpotlightLockedPlayerIdRef.current = null;
      return;
    }

    const locked = quizSpotlightLockedPlayerIdRef.current;
    if (locked && ids.includes(locked)) {
      quizSpotlightHoldRef.current = true;
      if (focusPlayerIdRef.current !== locked) setFocusPlayerId(locked);
      return;
    }

    const pick = ids[Math.floor(Math.random() * ids.length)]!;
    quizSpotlightLockedPlayerIdRef.current = pick;
    quizSpotlightHoldRef.current = true;
    if (focusPlayerIdRef.current !== pick) setFocusPlayerId(pick);
  }, [players, hunt?.waypoints, mapActivityTick, focusPosTick]);

  /** Lightweight roster check (player_id only) — new rows appear within ~ROSTER_POLL_MS without Supabase Realtime. */
  const rosterSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !huntId || !hunt?.id) return;
    rosterSignatureRef.current = null;
    let cancelled = false;

    const checkRoster = async () => {
      const [posQ, regQ] = await Promise.all([
        supabase.from("player_positions").select("player_id").eq("hunt_id", huntId),
        supabase.from("hunt_registrations").select("player_id").eq("hunt_id", huntId),
      ]);
      if (cancelled) return;
      if (posQ.error) return;
      const posSig = (posQ.data ?? [])
        .map((r: { player_id: string }) => String(r.player_id))
        .filter(Boolean)
        .sort()
        .join(",");
      const regSig = regQ.error
        ? ""
        : (regQ.data ?? [])
            .map((r: { player_id: string }) => String(r.player_id))
            .filter(Boolean)
            .sort()
            .join(",");
      const sig = `${posSig}|${regSig}`;
      if (rosterSignatureRef.current === null) {
        rosterSignatureRef.current = sig;
        return;
      }
      if (sig !== rosterSignatureRef.current) {
        rosterSignatureRef.current = sig;
        void loadBroadcastSnapshot(false);
      }
    };

    void checkRoster();
    const iv = window.setInterval(() => void checkRoster(), ROSTER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [supabase, huntId, hunt?.id, loadBroadcastSnapshot]);

  // Realtime: when hunts writes player_positions (locator, travel, heartbeat), refresh so Show all matches actual locations.
  // Requires `player_positions` in Supabase publication supabase_realtime (see database_realtime_broadcast.sql).
  useEffect(() => {
    if (!huntId || !supabase || !hunt) return;
    const ch = supabase
      .channel(`broadcast-pos-rt-${huntId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_positions", filter: `hunt_id=eq.${huntId}` },
        () => {
          if (realtimeSnapshotDebounceRef.current) clearTimeout(realtimeSnapshotDebounceRef.current);
          realtimeSnapshotDebounceRef.current = setTimeout(() => {
            realtimeSnapshotDebounceRef.current = null;
            void loadBroadcastSnapshot(false);
          }, 120);
        }
      )
      .subscribe();
    return () => {
      if (realtimeSnapshotDebounceRef.current) clearTimeout(realtimeSnapshotDebounceRef.current);
      realtimeSnapshotDebounceRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [huntId, supabase, hunt?.id, loadBroadcastSnapshot]);

  useEffect(() => {
    if (!activeToast) return;
    const timeout = window.setTimeout(() => {
      setActiveToast(() => toastQueueRef.current.shift() ?? null);
    }, TOAST_LIFETIME_MS);
    return () => window.clearTimeout(timeout);
  }, [activeToast]);

  // Map init after hunt region view resolved — frame state/nationwide, not waypoint #1.
  const tokenPresent = Boolean(MAPBOX_TOKEN);
  useEffect(() => {
    if (!tokenPresent || loading || !regionMapView) return;
    let cancelled = false;
    const view = regionMapView;

    async function initOnceContainerReady() {
      if (!tokenPresent) return;

      if (mapRef.current) {
        return;
      }

      if (!mapContainerRef.current) {
        if (!cancelled) {
          requestAnimationFrame(initOnceContainerReady);
        }
        return;
      }

      setMapReady(false);

      const initialCenter = view.center;
      // Default broadcast zoom: street-level (matches hunts). "Show all" will fit bounds when needed.
      const initialZoom = DEFAULT_ZOOM;

      try {
        const mapboxgl = (await import("mapbox-gl")).default as any;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapboxRef.current = mapboxgl;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [initialCenter.lng, initialCenter.lat],
          zoom: initialZoom,
          minZoom: 3.5,
          // Interactivity is toggled dynamically:
          // - "Show all": allow pan/zoom/rotate (globe)
          // - Focused player: lock map so camera logic matches the spotlight
          interactive: true,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          const bumpResize = () => {
            try {
              map.resize();
            } catch {
              /* ignore */
            }
          };
          bumpResize();
          // Do not auto-fit to the hunt region on load; we want a consistent zoom-14 default.
          // The "Show all" camera loop will keep everyone visible once player markers arrive.
          // Flex layout often finalises after first paint — without this, canvas can stay 0×0 or gray (no tiles).
          requestAnimationFrame(() => {
            bumpResize();
            window.setTimeout(bumpResize, 50);
            window.setTimeout(bumpResize, 300);
          });
          try {
            map.once("idle", () => {
              bumpResize();
            });
          } catch {
            /* ignore */
          }
          setMapReady(true);
        });

        map.on("error", (e: any) => {
          console.error("[Broadcast] mapbox error", e);
        });
      } catch (err) {
        console.error("[Broadcast] failed to init map", err);
      }
    }

    initOnceContainerReady();

    return () => {
      cancelled = true;
      try {
        focusedDestPinMarkerRef.current?.remove?.();
      } catch {}
      focusedDestPinMarkerRef.current = null;
      focusedDestPinColorRef.current = null;
      focusedDestPinLastLngLatRef.current = null;
      // Remove avatar/stop markers before map.remove — otherwise refs still point at detached markers and the
      // marker effect thinks the roster is unchanged (idsChanged false) and skips re-adding to the new map.
      try {
        Object.values(markersRef.current).forEach((m) => {
          try {
            m?.remove?.();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
      markersRef.current = {};
      try {
        Object.values(constraintStopMarkersRef.current).forEach((m) => {
          try {
            m?.remove?.();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
      constraintStopMarkersRef.current = {};
      try {
        mapRef.current?.remove?.();
      } catch {}
      mapRef.current = null;
      mapboxRef.current = null;
      renderedPlayerIdsRef.current = new Set();
      markerAvatarUrlRef.current = {};
      lastFitBoundsCountRef.current = 0;
      setMapReady(false);
    };
  }, [tokenPresent, loading, huntId, regionMapView]);

  /** Latest travel shadow event per player (travel_started / paused / resumed). */
  const travelShadowByPlayerIdRef = useRef<Record<string, TravelShadowState | null>>({});
  /** Last processed travel action id per player — only call Mapbox / update leg when action changed (poll, no realtime). */
  const lastProcessedTravelActionIdByPlayerIdRef = useRef<Record<string, string>>({});
  /** Last displayed position per player (for bearing and camera follow). */
  const lastDisplayedPosRef = useRef<Record<string, LngLat>>({});
  /** Last route-derived position per player — survives shadow clears so we never jump to inaccurate DB lng/lat. */
  const lastRoutePosByPlayerIdRef = useRef<Record<string, LngLat>>({});
  /** Previous frame’s marker position — used for bearing only (lastRoutePos is stale when idle). */
  const lastMarkerFramePosByPlayerIdRef = useRef<Record<string, LngLat>>({});
  /** Raw route coords from DB per player — persists even when shadow is null (travel ended or planned route). */
  const dbRouteCoordsRef = useRef<Record<string, [number, number][] | null>>({});
  /** Log avatar start to terminal once per load for comparison with hunts. */
  const hasLoggedBroadcastStartRef = useRef(false);
  /** Bearing in degrees per player. */
  const bearingRef = useRef<Record<string, number>>({});
  const playerColorRef = useRef<Record<string, string>>({});
  const BEARING_MIN_MOVE_KM = 0.003;
  const bearingAnchorRef = useRef<Record<string, LngLat>>({});
  const cameraLastCenterRef = useRef<LngLat | null>(null);
  const cameraLastMoveAtRef = useRef<number>(0);
  const lastPillActivityRef = useRef<Record<string, AvatarActivity | undefined>>({});

  const otherPlayersFeedLines = useMemo(() => {
    if (!focusPlayerId || players.length < 2) return [];
    return buildOtherPlayersActivityFeed(
      players,
      focusPlayerId,
      lastDisplayedPosRef.current,
      hunt?.waypoints
    );
    // lastDisplayedPosRef read intentionally; mapActivityTick/focusPosTick refresh interpolated positions
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + tick
  }, [players, focusPlayerId, hunt?.waypoints, mapActivityTick, focusPosTick]);

  const otherFeedSignature = otherPlayersFeedLines.join("¦");
  useEffect(() => {
    setOtherFeedIndex(0);
  }, [otherFeedSignature]);

  useEffect(() => {
    if (otherPlayersFeedLines.length <= 1) return;
    const t = window.setInterval(() => {
      setOtherFeedIndex((i) => (i + 1) % otherPlayersFeedLines.length);
    }, 5500);
    return () => window.clearInterval(t);
  }, [otherPlayersFeedLines.length, otherFeedSignature]);

  // Map markers: create/remove only when player set changes. Position is driven by animation tick.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;

    const initialLngLatForPlayer = (p: BroadcastPlayer): LngLat => {
      const pid = String(p.id);
      const disp = lastDisplayedPosRef.current[pid];
      if (disp) return { ...disp };
      const routeMem = lastRoutePosByPlayerIdRef.current[pid];
      if (routeMem) return { ...routeMem };
      const now = Date.now();
      const sh = travelShadowByPlayerIdRef.current[pid];
      if (sh?.routeCoords && sh.routeCoords.length >= 2 && sh.durationMs > 0) {
        const end = sh.startedAtMs + sh.durationMs;
        if (now >= sh.startedAtMs && now <= end) {
          return positionAlongRouteAt(sh.routeCoords, sh.startedAtMs, sh.durationMs, Math.min(now, end));
        }
      }
      if (
        p.travelRouteCoords &&
        p.travelRouteCoords.length >= 2 &&
        p.travelStartedAtMs > 0 &&
        (p.travelDurationMs ?? 0) > 0
      ) {
        const d = p.travelDurationMs as number;
        const end = p.travelStartedAtMs + d;
        if (now >= p.travelStartedAtMs && now <= end) {
          return positionAlongRouteAt(p.travelRouteCoords, p.travelStartedAtMs, d, Math.min(now, end));
        }
      }
      return { lng: p.pos.lng, lat: p.pos.lat };
    };

    const currentIds = new Set(players.map((p) => p.id));
    const rendered = renderedPlayerIdsRef.current;
    const idsChanged = currentIds.size !== rendered.size || [...currentIds].some((id) => !rendered.has(id));
    const missingMarker = players.some((p) => !markersRef.current[p.id]);
    if (!idsChanged && !missingMarker) return;

    players.forEach((p) => {
      const avatarKey = p.avatarUrl ?? `fallback:${p.name}`;
      const existingMarker = markersRef.current[p.id];
      if (existingMarker && markerAvatarUrlRef.current[p.id] === avatarKey) return;
      if (existingMarker) existingMarker.remove();
      const color = AVATAR_COLORS[Object.keys(markersRef.current).length % AVATAR_COLORS.length];
      playerColorRef.current[p.id] = color;
      const el = makeBroadcastMarkerEl(p, color);
      const initial = initialLngLatForPlayer(p);
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([initial.lng, initial.lat])
        .addTo(map);
      markersRef.current[p.id] = marker;
      markerAvatarUrlRef.current[p.id] = avatarKey;
      lastDisplayedPosRef.current[p.id] = { ...initial };
    });

    const toRemove = [...rendered].filter((id) => !currentIds.has(id));
    toRemove.forEach((id) => {
      markersRef.current[id]?.remove();
      delete markersRef.current[id];
      constraintStopMarkersRef.current[id]?.remove();
      delete constraintStopMarkersRef.current[id];
      delete lastDisplayedPosRef.current[id];
      delete lastMarkerFramePosByPlayerIdRef.current[id];
      delete bearingRef.current[id];
      delete bearingAnchorRef.current[id];
      delete playerColorRef.current[id];
      delete markerAvatarUrlRef.current[id];
      delete lastPillActivityRef.current[id];
    });

    renderedPlayerIdsRef.current = currentIds;

    const countChanged = lastFitBoundsCountRef.current !== players.length;
    if (countChanged) lastFitBoundsCountRef.current = players.length;
    if (players.length > 0 && !focusPlayerId && countChanged) {
      const plan = getBroadcastShowAllCameraPlan(players, lastDisplayedPosRef.current, regionMapView);
      applyBroadcastShowAllPlanToMap(
        map,
        plan,
        mapboxgl,
        BROADCAST_FIT_DURATION_MS,
        BROADCAST_FIT_PADDING,
        BROADCAST_FIT_MAX_ZOOM
      );
    }
  }, [mapReady, players, focusPlayerId, regionMapView]);

  // "Show all" follow: keep all avatars in view as they move (throttled to avoid jitter).
  useEffect(() => {
    if (!mapReady || focusPlayerId) return;
    const map = mapRef.current;
    if (!map) return;

    let rafId: number;
    let lastFitAt = 0;
    const INTERVAL_MS = 2500;
    const PADDING = 80;

    const tick = () => {
      if (focusPlayerIdRef.current) return;
      const now = Date.now();
      if (now - lastFitAt >= INTERVAL_MS) {
        const list = playersRef.current;
        const skipSingle =
          list.length === 1 && !showAllModePreferredRef.current;
        if (!skipSingle) {
          const plan = getBroadcastShowAllCameraPlan(list, lastDisplayedPosRef.current, regionMapView);
          if (plan.kind !== "none") {
            applyBroadcastShowAllPlanToMap(map, plan, mapboxRef.current, 1200, PADDING, BROADCAST_FIT_MAX_ZOOM);
            lastFitAt = now;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady, focusPlayerId, regionMapView]);

  // Map interactivity:
  // - Only interactive in "Show all on map" mode (no focused player).
  // - When interactive, use globe projection and allow rotation (bearing changes).
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const enableShowAllControls = () => {
      try {
        map.dragPan?.enable?.();
        map.scrollZoom?.enable?.();
        map.boxZoom?.enable?.();
        map.doubleClickZoom?.enable?.();
        map.keyboard?.enable?.();
        map.touchZoomRotate?.enable?.();
        map.dragRotate?.enable?.();
      } catch {
        /* ignore */
      }
      try {
        // Globe projection + fog are supported on Mapbox GL JS v2+; no-op if unavailable.
        map.setProjection?.("globe");
        map.setFog?.({});
      } catch {
        /* ignore */
      }
    };

    const disableAllControls = () => {
      try {
        map.dragPan?.disable?.();
        map.scrollZoom?.disable?.();
        map.boxZoom?.disable?.();
        map.doubleClickZoom?.disable?.();
        map.keyboard?.disable?.();
        map.touchZoomRotate?.disable?.();
        map.dragRotate?.disable?.();
      } catch {
        /* ignore */
      }
      try {
        // Keep default projection when locked to reduce visual changes while spotlighting.
        map.setProjection?.("mercator");
        map.setFog?.(null);
      } catch {
        /* ignore */
      }
    };

    const showAllActive = !focusPlayerId && showAllModePreferredRef.current;
    if (showAllActive) {
      enableShowAllControls();
    } else {
      disableAllControls();
    }
  }, [mapReady, focusPlayerId]);

  // Snap camera to all on-map avatars when entering "Show all" (immediate feedback).
  useEffect(() => {
    if (!mapReady || focusPlayerId) return;
    if (!showAllModePreferredRef.current) return;
    const map = mapRef.current;
    const Mapbox = mapboxRef.current as { LngLatBounds?: new () => { extend: (ll: [number, number]) => void } } | null;
    if (!map || !Mapbox) return;
    const list = playersRef.current;
    if (list.length === 0) return;
    const plan = getBroadcastShowAllCameraPlan(list, lastDisplayedPosRef.current, regionMapView);
    if (plan.kind === "fit" && !Mapbox.LngLatBounds) return;
    applyBroadcastShowAllPlanToMap(
      map,
      plan,
      Mapbox,
      BROADCAST_FIT_DURATION_MS,
      BROADCAST_FIT_PADDING,
      BROADCAST_FIT_MAX_ZOOM
    );
  }, [mapReady, focusPlayerId, players.length, regionMapView]);

  // (debug all-positions log removed)

  // Constraint stop markers: only keep map pins for refuel stops. Rest/rejuvenate is conveyed by avatar state and moments.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;

    const playersWithStop = players.filter(
      (p) => p.constraintState?.stop?.center && p.constraintState.kind === "refuel"
    );
    const stopIds = new Set(playersWithStop.map((p) => p.id));

    Object.keys(constraintStopMarkersRef.current).forEach((id) => {
      if (!stopIds.has(id)) {
        constraintStopMarkersRef.current[id]?.remove();
        delete constraintStopMarkersRef.current[id];
      }
    });

    playersWithStop.forEach((p) => {
      const center = p.constraintState!.stop!.center;
      const color = playerColorRef.current[p.id] ?? AVATAR_COLORS[0];
      if (constraintStopMarkersRef.current[p.id]) {
        constraintStopMarkersRef.current[p.id].setLngLat([center[0], center[1]]);
        return;
      }
      const el = makeConstraintStopMarkerEl(p.constraintState!.kind!, p.name, color);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([center[0], center[1]])
        .addTo(map);
      constraintStopMarkersRef.current[p.id] = marker;
    });
  }, [mapReady, players]);

  // Focused player: destination pin — green=quiz waypoint / quiz walk-bike leg end, yellow=other travel/refuel, blue=rest/rejuvenate stop.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;
    const Marker = mapboxgl.Marker;

    const fid = focusPlayerIdRef.current;
    const p = fid ? findBroadcastPlayerByFocusId(playersRef.current, fid) : undefined;
    const shadow = fid ? travelShadowByPlayerIdRef.current[fid] ?? null : null;
    const pin = computeFocusedPlayerDestinationPin(p, hunt?.waypoints ?? null, shadow, Date.now());

    if (!pin) {
      if (focusedDestPinMarkerRef.current) {
        try {
          focusedDestPinMarkerRef.current.remove?.();
        } catch {}
        focusedDestPinMarkerRef.current = null;
      }
      focusedDestPinColorRef.current = null;
      focusedDestPinLastLngLatRef.current = null;
      return;
    }

    const ll: [number, number] = [pin.lng, pin.lat];
    if (!focusedDestPinMarkerRef.current || focusedDestPinColorRef.current !== pin.color) {
      if (focusedDestPinMarkerRef.current) {
        try {
          focusedDestPinMarkerRef.current.remove?.();
        } catch {}
        focusedDestPinMarkerRef.current = null;
      }
      focusedDestPinColorRef.current = pin.color;
      focusedDestPinLastLngLatRef.current = ll;
      const el = makeDestinationPinEl(pin.color);
      focusedDestPinMarkerRef.current = new Marker({ element: el, anchor: "bottom" })
        .setLngLat(ll)
        .addTo(map);
    } else {
      const last = focusedDestPinLastLngLatRef.current;
      const posChanged = !last || last[0] !== ll[0] || last[1] !== ll[1];
      if (posChanged) {
        focusedDestPinMarkerRef.current.setLngLat(ll);
        focusedDestPinLastLngLatRef.current = ll;
      }
    }
  }, [mapReady, focusPlayerId, players, hunt?.waypoints, mapActivityTick, focusPosTick]);

  // Avatar position while focused is driven only by the RAF tick (same as show-all). A previous
  // focus-only snap here forced routeStart or projectPointToRoute when focusing and visibly
  // jumped the avatar backward vs DB/interpolated position.

  // Update status pills + travel badges on markers only when activity/mode changes (avoids DOM thrash)
  useEffect(() => {
    if (!mapReady) return;
    const wps = hunt?.waypoints;
    players.forEach((p) => {
      const marker = markersRef.current[p.id];
      if (!marker) return;
      const displayPos = lastDisplayedPosRef.current[p.id] ?? p.pos;
      const activity = getBroadcastMapActivity(p, displayPos, wps);
      if (lastPillActivityRef.current[p.id] !== activity) {
        lastPillActivityRef.current[p.id] = activity;
        updateMarkerStatusPill(marker, activity);
      }
      updateBroadcastTravelBadge(marker, p.travelMode);
    });
  }, [mapReady, players, hunt?.waypoints]);

  // Remove any leftover route/trail layers from older broadcast sessions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const style = map.getStyle?.();
    const sourceIds = Object.keys(style?.sources ?? {}).filter(
      (id) => id.startsWith("broadcast-route-source-") || id.startsWith("broadcast-trail-source-")
    );
    sourceIds.forEach((sourceId) => {
      const layerId = sourceId
        .replace("broadcast-route-source-", "broadcast-route-layer-")
        .replace("broadcast-trail-source-", "broadcast-trail-layer-");
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {}
    });
  }, [mapReady]);

  // Remove any focused route overlay (route line disabled on broadcast).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sourceId = "broadcast-focus-route";
    const layerId = "broadcast-focus-route-line";
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
  }, [mapReady]);

  // Render tick — position during travel comes only from the current leg. Same interpolation as hunts (positionAlongRouteAt); never use DB position for moving avatars. RAF = smooth like hunts.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    let rafId: number;

    const tick = () => {
      const list = playersRef.current;
      if (list.length === 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      list.forEach((p) => {
        const pid = String(p.id);
        try {
          const prevFramePos = lastMarkerFramePosByPlayerIdRef.current[pid];
          const { pos, isTraveling } = computeBroadcastAvatarLngLat(
            p,
            travelShadowByPlayerIdRef.current,
            dbRouteCoordsRef.current,
            now
          );
          if (isTraveling) {
            lastRoutePosByPlayerIdRef.current[pid] = pos;
          }
          lastDisplayedPosRef.current[pid] = pos;

          const marker = markersRef.current[p.id];
          if (!marker) return;
          const rotateEl = marker?.getElement?.()?.querySelector?.(
            "[data-marker-rotate]"
          ) as HTMLElement | null;
          const rotateBearing = prevFramePos ? bearingDeg(prevFramePos, pos) : null;
          if (rotateEl) {
            rotateEl.style.transform = rotateBearing != null ? `rotate(${rotateBearing}deg)` : "";
          }
          if (typeof marker.setLngLat === "function") {
            marker.setLngLat([pos.lng, pos.lat]);
          }
          lastMarkerFramePosByPlayerIdRef.current[pid] = pos;
        } catch (e) {
          console.error("[Broadcast] marker RAF tick", pid, e);
        }
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady]);

  // Instant center on focused avatar (before paint). Do not clear cameraLastCenterRef in the follow effect below —
  // that was wiping this and leaving the map on the hunt-region / show-all frame.
  useLayoutEffect(() => {
    if (!mapReady || !focusPlayerId) {
      lastFocusLayoutJumpKeyRef.current = "";
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const current = findBroadcastPlayerByFocusId(playersRef.current, focusPlayerId);
    if (!current) return;
    const dedupeKey = `${focusPlayerId}|${current.id}|${current.mapZoom ?? "z"}|${current.mapWidthPx ?? "w"}`;
    if (lastFocusLayoutJumpKeyRef.current === dedupeKey) return;
    lastFocusLayoutJumpKeyRef.current = dedupeKey;

    const { pos } = computeBroadcastAvatarLngLat(
      current,
      travelShadowByPlayerIdRef.current,
      dbRouteCoordsRef.current,
      Date.now()
    );
    lastDisplayedPosRef.current[current.id] = pos;
    lastDisplayedPosRef.current[focusPlayerId] = pos;

    const shadow =
      travelShadowByPlayerIdRef.current[current.id] ??
      travelShadowByPlayerIdRef.current[focusPlayerId] ??
      null;
    const now = Date.now();
    const startedAt = shadow?.startedAtMs ?? 0;
    const durationMs = shadow?.durationMs ?? 0;
    const mode = shadow?.modeId ?? current.travelMode ?? "walk";
    const isPlaneTraveling =
      mode === "plane" &&
      startedAt > 0 &&
      durationMs > 0 &&
      (shadow?.routeCoords?.length ?? 0) >= 2 &&
      !shadow?.pausedAtMs &&
      now >= startedAt &&
      now <= startedAt + durationMs;
    const bw = mapContainerRef.current?.clientWidth ?? 600;
    const zoom = broadcastFocusZoomForPlayer(
      current.mapZoom ?? null,
      current.mapWidthPx ?? null,
      bw,
      isPlaneTraveling,
      isMobile
    );
    try {
      if (typeof (map as any).stop === "function") (map as any).stop();
      if (typeof (map as any).jumpTo === "function") {
        (map as any).jumpTo({
          center: [pos.lng, pos.lat],
          zoom,
          bearing: 0,
          pitch: 0,
        });
      } else {
        map.easeTo({ center: [pos.lng, pos.lat], zoom, bearing: 0, pitch: 0, duration: 0 });
      }
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    cameraLastCenterRef.current = { ...pos };
    cameraLastMoveAtRef.current = Date.now();
  }, [mapReady, focusPlayerId, players, isMobile]);

  // Unified camera follow: RAF eases the map when the focused avatar moves (interval + min move).
  useEffect(() => {
    if (!mapReady || !focusPlayerId) return;
    const map = mapRef.current;
    if (!map) return;

    const CAMERA_INTERVAL_MS = 2000;
    const CAMERA_INTERVAL_TRAVEL_MS = 900;
    const CAMERA_PLANE_INTERVAL_MS = 1400;
    /** When stationary, ignore tiny camera jitter. While moving, distance per check is often < 8m — do not skip. */
    const CAMERA_MIN_MOVE_KM = 0.008;
    const CAMERA_EASE_DURATION = 2200;

    let rafId: number;
    let firstFrame = true;

    const tick = () => {
      const now = Date.now();
      const current = findBroadcastPlayerByFocusId(playersRef.current, focusPlayerId);
      if (!current) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const { pos, isTraveling } = computeBroadcastAvatarLngLat(
        current,
        travelShadowByPlayerIdRef.current,
        dbRouteCoordsRef.current,
        now
      );
      lastDisplayedPosRef.current[current.id] = pos;
      lastDisplayedPosRef.current[focusPlayerId] = pos;

      const shadowMap = travelShadowByPlayerIdRef.current;
      const resolvedId = current.id;
      const shadow =
        shadowMap[resolvedId] ?? shadowMap[focusPlayerId] ?? undefined;
      const startedAt = shadow?.startedAtMs ?? 0;
      const durationMs = shadow?.durationMs ?? 0;
      const mode = shadow?.modeId ?? current?.travelMode ?? "walk";
      const isPlaneTraveling =
        mode === "plane" && startedAt > 0 && durationMs > 0 &&
        (shadow?.routeCoords?.length ?? 0) >= 2 &&
        !shadow?.pausedAtMs &&
        now >= startedAt && now <= startedAt + durationMs;

      const intervalMs = isPlaneTraveling
        ? CAMERA_PLANE_INTERVAL_MS
        : isTraveling
          ? CAMERA_INTERVAL_TRAVEL_MS
          : CAMERA_INTERVAL_MS;

      if (!firstFrame && now - cameraLastMoveAtRef.current < intervalMs) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const lastCenter = cameraLastCenterRef.current;
      const moved = lastCenter ? haversineKm(lastCenter, pos) : Infinity;
      if (!firstFrame && !isTraveling && moved < CAMERA_MIN_MOVE_KM) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const bw = mapContainerRef.current?.clientWidth ?? 600;
      const zoom = broadcastFocusZoomForPlayer(
        current?.mapZoom ?? null,
        current?.mapWidthPx ?? null,
        bw,
        isPlaneTraveling,
        isMobile
      );

      // First RAF tick: useLayoutEffect above already jumpTo'd when the focused row exists.
      if (firstFrame) {
        firstFrame = false;
        if (cameraLastCenterRef.current) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        try {
          if (typeof (map as any).stop === "function") (map as any).stop();
          if (typeof (map as any).jumpTo === "function") {
            (map as any).jumpTo({ center: [pos.lng, pos.lat], zoom, bearing: 0, pitch: 0 });
          } else {
            map.easeTo({ center: [pos.lng, pos.lat], zoom, duration: 0 });
          }
          try {
            map.resize();
          } catch {
            /* ignore */
          }
        } catch {
          map.easeTo({ center: [pos.lng, pos.lat], zoom, duration: CAMERA_EASE_DURATION });
        }
        cameraLastCenterRef.current = { ...pos };
        cameraLastMoveAtRef.current = now;
        rafId = requestAnimationFrame(tick);
        return;
      }

      cameraLastCenterRef.current = { ...pos };
      cameraLastMoveAtRef.current = now;
      map.easeTo({ center: [pos.lng, pos.lat], zoom, duration: CAMERA_EASE_DURATION });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady, focusPlayerId, isMobile]);

  if (!supabase) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <p className="text-lg font-bold">Broadcast unavailable</p>
        <p className="mt-2 text-sm text-white/70">Configure Supabase to enable the live broadcast.</p>
        <Link href="/" className="mt-4 text-[#60A5FA] hover:underline">Back to home</Link>
      </div>
    );
  }

  if (!huntId) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <p className="text-lg font-bold">No hunt selected</p>
        <Link href="/" className="mt-4 text-[#60A5FA] hover:underline">Back to home</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white overflow-hidden">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-white/30 border-t-white" />
        <p className="mt-4 font-bold">Loading broadcast…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <p className="text-lg font-bold text-red-300">{error}</p>
        <Link href="/" className="mt-4 text-[#60A5FA] hover:underline">Back to home</Link>
      </div>
    );
  }

  const focusedPlayer = focusPlayerId ? findBroadcastPlayerByFocusId(players, focusPlayerId) ?? null : null;
  const focusDisplayPos =
    focusedPlayer != null
      ? (lastDisplayedPosRef.current[focusedPlayer.id] ?? focusedPlayer.pos)
      : null;
  const latestFocusedChallenge = focusedPlayer
    ? latestChallengeForPlayer(challenges, focusedPlayer.id)
    : null;
  const focusConstraintCopy = focusedPlayer ? buildConstraintFocusCopy(focusedPlayer) : null;
  const focusQuizCopy = focusedPlayer
    ? buildQuizFocusCopy(focusedPlayer, latestFocusedChallenge, focusDisplayPos, hunt?.waypoints)
    : null;
  const baseNarratorLineForFocus =
    focusedPlayer && focusDisplayPos
      ? buildNarratorLine(focusedPlayer, {
          displayPos: focusDisplayPos,
          waypoints: hunt?.waypoints,
        })
      : "";
  const quizMissNarratorLine =
    focusedPlayer && focusDisplayPos
      ? buildQuizMissPenaltyNarratorLine(
          focusedPlayer,
          latestFocusedChallenge,
          focusDisplayPos,
          hunt?.waypoints
        )
      : null;
  const narratorLineForFocus = quizMissNarratorLine ?? baseNarratorLineForFocus;
  const focusIdleLocationCopy =
    focusedPlayer &&
    focusDisplayPos &&
    !focusQuizCopy &&
    !focusConstraintCopy &&
    (quizMissNarratorLine != null ||
      focusedPlayerShowsIdleNarrator(focusedPlayer, baseNarratorLineForFocus))
      ? describeBroadcastIdleLocation(
          focusDisplayPos,
          hunt?.waypoints,
          focusedPlayer ? broadcastPlayerHasStartedMoving(focusedPlayer) : false
        )
      : null;

  const bottomFeedLine =
    players.length < 2
      ? "Waiting for more lootas to join this hunt…"
      : !focusPlayerId
        ? `${players.length} lootas live — pick someone to follow`
        : otherPlayersFeedLines.length === 0
          ? "No other lootas to show."
          : otherPlayersFeedLines[otherFeedIndex % otherPlayersFeedLines.length] ?? "";
  const bottomFeedCounter =
    otherPlayersFeedLines.length > 1
      ? `Other lootas ${(otherFeedIndex % otherPlayersFeedLines.length) + 1}/${otherPlayersFeedLines.length}`
      : null;

  return (
    <div className="h-screen bg-[#0F172A] text-white overflow-hidden flex flex-col">
      <main className="flex-1 relative min-h-0">
        <div className="absolute inset-0">
          {MAPBOX_TOKEN ? (
            <div ref={mapContainerRef} className="h-full w-full" />
          ) : (
            <div className="h-full flex items-center justify-center bg-[#0F172A] text-white/70">
              <p className="text-sm">Map unavailable</p>
            </div>
          )}
        </div>

        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 82% 72% at 50% 50%, transparent 42%, rgba(15,23,42,0.5) 100%)" }} />

        {(() => {
          void quizBroadcastTick;
          const fp = focusedPlayer;
          const pos = focusDisplayPos;
          if (!fp || !pos || !fp.currentQuestionText?.trim()) return null;
          if (!broadcastActivelyAtQuiz(fp, pos, hunt?.waypoints)) return null;
          const nowMs = Date.now();
          let secondsLeft: number | null = null;
          if (fp.questionDeadlineAtMs && fp.questionDeadlineAtMs > 0) {
            secondsLeft = Math.max(0, Math.ceil((fp.questionDeadlineAtMs - nowMs) / 1000));
          } else {
            const t0 = parseTimestampMs(fp.updatedAt);
            if (t0 > 0) {
              secondsLeft = Math.max(0, Math.ceil((t0 + TASK_TIME_SECONDS * 1000 - nowMs) / 1000));
            }
          }
          return (
            <div className="absolute bottom-36 left-1/2 z-30 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 pointer-events-none">
              <div className="rounded-2xl border-2 border-amber-400/90 bg-[#0f172a]/95 px-5 py-4 shadow-2xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">On air · Quiz</p>
                <p className="mt-1 text-xs font-bold text-white/80">{fp.name}&apos;s question</p>
                <p className="mt-3 text-sm md:text-base font-semibold leading-snug text-white">{fp.currentQuestionText}</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Time left</span>
                  <span className="text-2xl md:text-3xl font-black tabular-nums text-amber-300 drop-shadow-lg">
                    {secondsLeft != null ? `${secondsLeft}s` : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className="m-4 flex items-center justify-between gap-3">
            <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md px-5 py-3 text-slate-900 shadow-lg">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Loota" className="h-11 w-auto object-contain sm:h-[52px]" />
                <div>
                  <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
                    {hunt?.region_name ?? "Nigeria"}
                  </p>
                  <p className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">{hunt?.title ?? "Loota Hunt"}</p>
                </div>
              </div>
            </div>
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md px-3 py-2 text-slate-900">
              <select
                value={focusPlayerId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    showAllModePreferredRef.current = true;
                    userPinnedFocusPlayerRef.current = false;
                    quizSpotlightHoldRef.current = false;
                    quizSpotlightLockedPlayerIdRef.current = null;
                    setFocusPlayerId("");
                  } else {
                    showAllModePreferredRef.current = false;
                    userPinnedFocusPlayerRef.current = true;
                    setFocusPlayerId(v);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-300 min-w-[160px]"
              >
                <option value="">Show all on map</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 text-[10px] font-black uppercase tracking-widest text-white">
                <span className="size-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
              <Link href="/" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900">Exit</Link>
            </div>
          </div>
        </header>

        {playerPositionsTableEmpty ? (
          <div className="absolute left-1/2 top-[5.25rem] z-20 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 pointer-events-auto rounded-xl border border-amber-400/35 bg-amber-950/92 px-3 py-2.5 text-center text-[10px] sm:text-[11px] leading-snug text-amber-100 shadow-lg">
            <span className="font-black text-amber-200">player_positions is empty</span> for this hunt — broadcast loads live data from that table. Seed rows by having hunters{" "}
            <span className="text-white font-bold">log in</span>, join from <span className="text-white font-bold">Lobby</span> (upserts a position), or open{" "}
            <span className="text-white font-bold">Hunts</span> with GPS/locator so the heartbeat can write (~every 4s). If upserts fail, check Supabase RLS (insert/update own row) and the browser console on Hunts for errors.
          </div>
        ) : null}

        {activeToast ? (
          <div className="absolute bottom-[5.5rem] left-4 z-30 w-[min(360px,calc(100%-2rem))] pointer-events-none">
            <div
              key={activeToast.id}
              className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md bg-white/95 text-slate-900 transition-opacity duration-300 ${
                activeToast.tone === "success"
                  ? "border-emerald-300"
                  : activeToast.tone === "danger"
                    ? "border-red-300"
                    : activeToast.tone === "warning"
                      ? "border-amber-300"
                      : "border-slate-200"
              }`}
            >
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">{activeToast.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{activeToast.body}</p>
            </div>
          </div>
        ) : null}

        {focusedPlayer ? (
          <div className="absolute right-4 top-24 z-20 w-[420px] max-w-[calc(100%-2rem)] rounded-3xl border border-slate-200 bg-white/95 backdrop-blur-md p-4 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-full overflow-hidden border-2 border-[#2563EB] shrink-0 bg-slate-100 flex items-center justify-center text-sm font-black">
                {focusedPlayer.avatarUrl ? (
                  <img src={focusedPlayer.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  focusedPlayer.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black truncate">{focusedPlayer.name}</p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[11px]">{travelIcon(focusedPlayer.travelMode)}</span>
                  {focusedPlayer.keys}/{focusedPlayer.keysToWin} keys
                </p>
              </div>
              {(() => {
                const act =
                  focusDisplayPos != null
                    ? getBroadcastMapActivity(focusedPlayer, focusDisplayPos, hunt?.waypoints)
                    : null;
                if (!act) return null;
                const isConstraint = ACTIVITY_IS_CONSTRAINT[act];
                return (
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${
                    act === "sos" ? "bg-red-600/90 border-red-400/50 text-white animate-pulse"
                    : isConstraint ? "bg-amber-800/90 border-amber-500/40 text-amber-100 animate-pulse"
                    : "bg-slate-100 border-slate-200 text-amber-700"
                  }`}>
                    <span className="material-symbols-outlined text-[11px]">{ACTIVITY_ICON[act]}</span>
                    {ACTIVITY_LABEL[act]}
                  </span>
                );
              })()}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-800">{narratorLineForFocus}</p>
            {focusIdleLocationCopy ? (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{focusIdleLocationCopy}</p>
            ) : null}
            {focusConstraintCopy ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-700">{focusConstraintCopy}</p>
            ) : null}
            {focusQuizCopy ? (
              <p className="mt-1 text-[11px] leading-relaxed text-blue-700">{focusQuizCopy}</p>
            ) : null}
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/85 to-transparent pointer-events-none z-20">
          <p className="text-sm font-bold text-white drop-shadow-lg max-w-[min(100%,520px)]">{bottomFeedLine}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/55 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              {players.length} loota{players.length !== 1 ? "s" : ""} live · {hunt?.keys_to_win ?? 0} keys to win
            </span>
            {bottomFeedCounter ? <span className="text-white/70">{bottomFeedCounter}</span> : null}
          </p>
        </div>
      </main>
    </div>
  );
}
