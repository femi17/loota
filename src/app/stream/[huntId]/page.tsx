"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  simulateTravelTick,
  buildCumKm,
  bearingDeg,
  haversineKm,
  type TravelSimParams,
  type LngLat,
} from "@/lib/travel-simulation";
import {
  TRAVEL_MODES,
  SIM_SPEEDUP,
  WALK_ANIMATION_SPEEDUP,
  MIN_WALK_ANIMATION_MS,
  MAX_WALK_ANIMATION_MS,
  WALK_REJUVENATE_EVERY_KM,
  BIKE_REJUVENATE_EVERY_KM,
  MOTO_REFUEL_EVERY_KM,
  CAR_REFUEL_EVERY_KM,
  DRIVE_REST_EVERY_KM,
  BUS_STOP_EVERY_KM,
  DEMO_TRAVEL_SPEED_KMH,
} from "@/app/hunts/constants";
import type { TravelModeId } from "@/app/hunts/types";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const AVATAR_COLORS = [
  "#6366F1", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#3B82F6", "#84CC16",
];
const TRAIL_MAX = 100;

// ─── Types ───────────────────────────────────────────────────────────────────

type StreamPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  pos: LngLat;
  keys: number;
  keysToWin: number;
  travelMode: TravelModeId;
  updatedAt: string;
  travelStartedAt: string | null;
  routeCoords: [number, number][] | null;
  durationMs: number | null;
  constraintKind: string | null;
  constraintStatus: string | null;
};

type ConstraintKind = "rejuvenate" | "refuel" | "rest";

type PlayerSim = {
  sim: TravelSimParams;
  nextRejuvenateAtKm: number | undefined;
  nextRefuelAtKm: number | undefined;
  nextRestAtKm: number | undefined;
  nextBusStopAtKm: number | undefined;
  travelledKm: number;
  constraintTriggered: ConstraintKind | null;
};

type NarratorEvent = {
  id: string;
  time: number;
  playerId: string;
  playerName: string;
  kind: "travel_start" | "constraint" | "constraint_resolved" | "arrived" | "decision";
  message: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function normRouteCoords(raw: unknown): [number, number][] | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const ok = raw.every(
      (pt: unknown) => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === "number" && typeof pt[1] === "number"
    );
    return ok ? (raw as [number, number][]) : null;
  }
  if (typeof raw === "string") {
    try { return normRouteCoords(JSON.parse(raw)); } catch { return null; }
  }
  return null;
}

function modeLabel(id: string): string {
  return TRAVEL_MODES.find((m) => m.id === id)?.label ?? id;
}

function modeIcon(id: string): string {
  const icons: Record<string, string> = {
    walk: "directions_walk", bicycle: "directions_bike", motorbike: "two_wheeler",
    car: "directions_car", bus: "directions_bus", plane: "flight",
  };
  return icons[id] ?? "directions_walk";
}

function computeDurationMs(totalKm: number, modeId: TravelModeId): number {
  const speedKmh = modeId === "walk" ? 5 : (TRAVEL_MODES.find((m) => m.id === modeId)?.speedKmh ?? DEMO_TRAVEL_SPEED_KMH);
  const baseSpeedup = modeId === "walk" ? SIM_SPEEDUP * WALK_ANIMATION_SPEEDUP : SIM_SPEEDUP;
  const speedKmPerMs = speedKmh / (60 * 60 * 1000);
  const rawMs = totalKm / speedKmPerMs;
  let ms = Math.max(5000, Math.round(rawMs / baseSpeedup));
  if (modeId === "walk") ms = clamp(ms, MIN_WALK_ANIMATION_MS, MAX_WALK_ANIMATION_MS);
  return ms;
}

function getThresholds(modeId: TravelModeId) {
  return {
    nextRejuvenateAtKm:
      modeId === "walk" ? WALK_REJUVENATE_EVERY_KM :
      modeId === "bicycle" ? BIKE_REJUVENATE_EVERY_KM : undefined,
    nextRefuelAtKm:
      modeId === "motorbike" ? MOTO_REFUEL_EVERY_KM :
      modeId === "car" ? CAR_REFUEL_EVERY_KM : undefined,
    nextRestAtKm:
      modeId === "motorbike" || modeId === "car" ? DRIVE_REST_EVERY_KM : undefined,
    nextBusStopAtKm:
      modeId === "bus" ? BUS_STOP_EVERY_KM : undefined,
  };
}

function sanitizeAvatarUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // ignore malformed URL
  }
  return null;
}

function buildMarkerElement(
  player: Pick<StreamPlayer, "name" | "avatarUrl">,
  color: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";

  const rotWrap = document.createElement("div");
  rotWrap.style.position = "relative";
  rotWrap.style.overflow = "visible";
  rotWrap.setAttribute("data-marker-rotate", "");

  const avatarRing = document.createElement("div");
  avatarRing.style.width = "38px";
  avatarRing.style.height = "38px";
  avatarRing.style.borderRadius = "9999px";
  avatarRing.style.border = `3px solid ${color}`;
  avatarRing.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
  avatarRing.style.overflow = "hidden";
  avatarRing.style.background = "#fff";
  avatarRing.style.display = "grid";
  avatarRing.style.placeItems = "center";
  avatarRing.style.transition = "transform 0.6s ease-out";

  const safeAvatar = sanitizeAvatarUrl(player.avatarUrl);
  if (safeAvatar) {
    const avatar = document.createElement("div");
    avatar.style.width = "100%";
    avatar.style.height = "100%";
    avatar.style.backgroundImage = `url("${safeAvatar}")`;
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";
    avatar.style.borderRadius = "9999px";
    avatarRing.appendChild(avatar);
  } else {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "22px";
    icon.style.color = "#64748B";
    icon.textContent = "person";
    avatarRing.appendChild(icon);
  }

  const namePill = document.createElement("div");
  namePill.style.position = "absolute";
  namePill.style.left = "50%";
  namePill.style.top = "-16px";
  namePill.style.transform = "translateX(-50%)";
  namePill.style.padding = "2px 6px";
  namePill.style.borderRadius = "9999px";
  namePill.style.background = "rgba(255,255,255,0.9)";
  namePill.style.border = "1px solid #E2E8F0";
  namePill.style.fontSize = "9px";
  namePill.style.fontWeight = "800";
  namePill.style.letterSpacing = "0.06em";
  namePill.style.textTransform = "uppercase";
  namePill.style.whiteSpace = "nowrap";
  namePill.style.color = "#0F172A";
  namePill.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
  namePill.textContent = player.name;

  const statusPill = document.createElement("div");
  statusPill.setAttribute("data-status-pill", "");
  statusPill.style.position = "absolute";
  statusPill.style.left = "50%";
  statusPill.style.bottom = "-12px";
  statusPill.style.transform = "translateX(-50%)";
  statusPill.style.padding = "1px 5px";
  statusPill.style.borderRadius = "9999px";
  statusPill.style.fontSize = "8px";
  statusPill.style.fontWeight = "700";
  statusPill.style.whiteSpace = "nowrap";
  statusPill.style.display = "none";

  rotWrap.appendChild(avatarRing);
  rotWrap.appendChild(namePill);
  rotWrap.appendChild(statusPill);
  el.appendChild(rotWrap);
  return el;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StreamPage() {
  const { huntId } = useParams<{ huntId: string }>();
  const [hunt, setHunt] = useState<{ name: string; keys_to_win: number } | null>(null);
  const [players, setPlayers] = useState<StreamPlayer[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [narratorEvents, setNarratorEvents] = useState<NarratorEvent[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const playersRef = useRef<StreamPlayer[]>([]);
  playersRef.current = players;

  const simMapRef = useRef<Record<string, PlayerSim | null>>({});
  const simKeyRef = useRef<Record<string, string>>({});
  const lastDisplayedPosRef = useRef<Record<string, LngLat>>({});
  const bearingValRef = useRef<Record<string, number>>({});
  const bearingAnchorRef = useRef<Record<string, LngLat>>({});
  const trailRef = useRef<Record<string, LngLat[]>>({});
  const trailLayerIdsRef = useRef<Set<string>>(new Set());
  const routeLayerIdsRef = useRef<Set<string>>(new Set());
  const playerColorRef = useRef<Record<string, string>>({});
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const trailLastSetRef = useRef<Record<string, number>>({});
  const cameraLastRef = useRef<{ pos: LngLat | null; at: number }>({ pos: null, at: 0 });
  const constraintWasActiveRef = useRef<Record<string, boolean>>({});
  const narratorIdRef = useRef(0);

  const pushEvent = useCallback((e: Omit<NarratorEvent, "id" | "time">) => {
    const ev: NarratorEvent = { ...e, id: String(++narratorIdRef.current), time: Date.now() };
    setNarratorEvents((prev) => [ev, ...prev].slice(0, 50));
  }, []);

  // ─── Load hunt + initial players ────────────────────────────────────────
  useEffect(() => {
    if (!huntId) return;
    (async () => {
      const { data: h } = await supabase
        .from("hunts")
        .select("name, keys_to_win")
        .eq("id", huntId)
        .maybeSingle();
      if (h) setHunt(h);

      const { data: rows } = await supabase
        .from("player_positions")
        .select("player_id, player_name, lng, lat, keys, travel_mode, last_active_at, travel_started_at, travel_route_coords, travel_duration_ms, constraint_state")
        .eq("hunt_id", huntId);

      if (rows) {
        const avatarMap: Record<string, string | null> = {};
        const ids = rows.map((r: any) => r.player_id);
        if (ids.length) {
          const { data: profiles } = await supabase
            .from("player_profiles")
            .select("user_id, avatar_url")
            .in("user_id", ids);
          profiles?.forEach((p: any) => { avatarMap[p.user_id] = p.avatar_url; });
        }

        setPlayers(
          rows.map((r: any, idx: number) => {
            if (!playerColorRef.current[r.player_id]) {
              playerColorRef.current[r.player_id] = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            }
            const cs = r.constraint_state;
            return {
              id: r.player_id,
              name: r.player_name ?? "Loota",
              avatarUrl: avatarMap[r.player_id] ?? null,
              pos: { lng: Number(r.lng), lat: Number(r.lat) },
              keys: r.keys ?? 0,
              keysToWin: h?.keys_to_win ?? 5,
              travelMode: r.travel_mode ?? "walk",
              updatedAt: r.last_active_at ?? new Date().toISOString(),
              travelStartedAt: r.travel_started_at ?? null,
              routeCoords: normRouteCoords(r.travel_route_coords),
              durationMs: typeof r.travel_duration_ms === "number" ? r.travel_duration_ms : null,
              constraintKind: cs?.kind ?? null,
              constraintStatus: cs?.status ?? null,
            } satisfies StreamPlayer;
          })
        );
      }
    })();
  }, [huntId]);

  // ─── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!huntId) return;
    const channel = supabase
      .channel(`stream-pos-${huntId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_positions", filter: `hunt_id=eq.${huntId}` },
        async (payload: { eventType: string; new?: any }) => {
          const n = payload.new;
          if (!n) return;

          let avatarUrl: string | null = null;
          const { data: pr } = await supabase
            .from("player_profiles")
            .select("avatar_url")
            .eq("user_id", n.player_id)
            .maybeSingle();
          if (pr) avatarUrl = pr.avatar_url;

          const cs = typeof n.constraint_state === "object" ? n.constraint_state : null;
          const next: StreamPlayer = {
            id: n.player_id,
            name: n.player_name ?? "Loota",
            avatarUrl,
            pos: { lng: Number(n.lng), lat: Number(n.lat) },
            keys: n.keys ?? 0,
            keysToWin: hunt?.keys_to_win ?? 5,
            travelMode: n.travel_mode ?? "walk",
            updatedAt: n.last_active_at ?? new Date().toISOString(),
            travelStartedAt: n.travel_started_at ?? null,
            routeCoords: normRouteCoords(n.travel_route_coords),
            durationMs: typeof n.travel_duration_ms === "number" ? n.travel_duration_ms : null,
            constraintKind: cs?.kind ?? null,
            constraintStatus: cs?.status ?? null,
          };

          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === next.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], ...next, avatarUrl: next.avatarUrl ?? updated[idx].avatarUrl };
              return updated;
            }
            if (!playerColorRef.current[next.id]) {
              playerColorRef.current[next.id] = AVATAR_COLORS[prev.length % AVATAR_COLORS.length];
            }
            return [...prev, next];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [huntId, hunt?.keys_to_win]);

  // ─── Map init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: "mapbox://styles/mapbox/standard",
        center: [3.39, 6.52],
        zoom: 12,
        pitch: 45,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("load", () => { if (!cancelled) { map.resize(); setMapReady(true); } });
    })();

    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
  }, []);

  // ─── Create / remove markers when player set changes ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;

    const currentIds = new Set(players.map((p) => p.id));
    const rendered = renderedIdsRef.current;
    const changed = currentIds.size !== rendered.size || [...currentIds].some((id) => !rendered.has(id));
    if (!changed) return;

    currentIds.forEach((id) => {
      if (rendered.has(id)) return;
      const p = players.find((x) => x.id === id);
      if (!p) return;

      const color = playerColorRef.current[id] ?? AVATAR_COLORS[0];
      const el = buildMarkerElement(p, color);

      el.addEventListener("click", () => setFocusId((prev) => (prev === id ? null : id)));

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.pos.lng, p.pos.lat])
        .addTo(map);
      markersRef.current[id] = marker;
      lastDisplayedPosRef.current[id] = { ...p.pos };
    });

    [...rendered].forEach((id) => {
      if (currentIds.has(id)) return;
      markersRef.current[id]?.remove?.();
      delete markersRef.current[id];
      delete simMapRef.current[id];
      delete simKeyRef.current[id];
      delete lastDisplayedPosRef.current[id];
    });

    renderedIdsRef.current = new Set(currentIds);
  }, [mapReady, players]);

  // ─── Draw route lines ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    players.forEach((p) => {
      const color = playerColorRef.current[p.id] ?? AVATAR_COLORS[0];
      const coords = p.routeCoords;
      const srcId = "stream-route-src-" + p.id;
      const lyrId = "stream-route-lyr-" + p.id;

      if (coords && coords.length >= 2) {
        const geojson = {
          type: "Feature" as const, properties: {},
          geometry: { type: "LineString" as const, coordinates: coords },
        };
        if (!map.getSource(srcId)) {
          map.addSource(srcId, { type: "geojson", data: geojson });
          map.addLayer({
            id: lyrId, type: "line", source: srcId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": color, "line-width": 4, "line-opacity": 0.85 },
          });
          routeLayerIdsRef.current.add(p.id);
        } else {
          (map.getSource(srcId) as any)?.setData(geojson);
        }
      } else {
        if (routeLayerIdsRef.current.has(p.id)) {
          try {
            if (map.getLayer(lyrId)) map.removeLayer(lyrId);
            if (map.getSource(srcId)) map.removeSource(srcId);
          } catch {}
          routeLayerIdsRef.current.delete(p.id);
        }
      }
    });

    const ids = new Set(players.map((p) => p.id));
    [...routeLayerIdsRef.current].forEach((id) => {
      if (ids.has(id)) return;
      try {
        if (map.getLayer("stream-route-lyr-" + id)) map.removeLayer("stream-route-lyr-" + id);
        if (map.getSource("stream-route-src-" + id)) map.removeSource("stream-route-src-" + id);
      } catch {}
      routeLayerIdsRef.current.delete(id);
    });
  }, [mapReady, players]);

  // ─── SIMULATION TICK — the core engine ─────────────────────────────────
  // For each player with travel data, we run the EXACT same simulation as
  // the hunt page: build TravelSimParams from the route, run simulateTravelTick
  // every 16ms with a LOCAL clock. No DB positions in the loop.
  //
  // Constraints are detected locally at the same thresholds (same constants).
  // When a constraint is hit, the sim pauses. When the hunt page resolves
  // it (constraint_state goes null), the sim resumes.
  useEffect(() => {
    if (!mapReady) return;

    const TRAIL_INTERVAL = 500;
    const BEARING_MIN_KM = 0.003;
    const lastBearing: Record<string, number | null> = {};

    const interval = window.setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const now = Date.now();
      const list = playersRef.current;

      list.forEach((p) => {
        const marker = markersRef.current[p.id];
        if (!marker) return;

        const sessionKey = p.travelStartedAt ?? "";
        const prevKey = simKeyRef.current[p.id] ?? "";
        const hasTravel =
          sessionKey !== "" &&
          p.routeCoords != null && p.routeCoords.length >= 2 &&
          p.durationMs != null && p.durationMs > 0;

        // ── Build new sim when a new trip starts ─────────────────
        if (hasTravel && sessionKey !== prevKey) {
          const coords = p.routeCoords!;
          const { cumKm, totalKm } = buildCumKm(coords);
          const lastCoord = coords[coords.length - 1];
          const modeId = p.travelMode;

          const durationMs = computeDurationMs(totalKm, modeId);
          const thresholds = getThresholds(modeId);

          const isConstrained = p.constraintKind != null;

          const sim: TravelSimParams = {
            coords,
            cumKm,
            totalKm,
            to: { lng: lastCoord[0], lat: lastCoord[1] },
            modeId,
            durationMs,
            startedAt: now,
            paused: isConstrained,
            pausedAt: isConstrained ? now : 0,
          };

          simMapRef.current[p.id] = {
            sim,
            ...thresholds,
            travelledKm: 0,
            constraintTriggered: null,
          };
          simKeyRef.current[p.id] = sessionKey;
          constraintWasActiveRef.current[p.id] = isConstrained;

          pushEvent({
            playerId: p.id, playerName: p.name,
            kind: "travel_start",
            message: `${p.name} started ${modeLabel(modeId).toLowerCase()}ing — ${totalKm.toFixed(1)}km trip`,
          });
        } else if (!hasTravel && prevKey !== "") {
          if (simMapRef.current[p.id]) {
            pushEvent({
              playerId: p.id, playerName: p.name,
              kind: "arrived",
              message: `${p.name} stopped traveling`,
            });
          }
          simMapRef.current[p.id] = null;
          simKeyRef.current[p.id] = "";
          delete constraintWasActiveRef.current[p.id];
        }

        // ── Handle constraint pause / resume ─────────────────────
        const ps = simMapRef.current[p.id];
        if (ps) {
          const isConstrained = p.constraintKind != null;
          const was = constraintWasActiveRef.current[p.id] ?? false;

          if (isConstrained && !was) {
            ps.sim.paused = true;
            ps.sim.pausedAt = now;
            constraintWasActiveRef.current[p.id] = true;

            pushEvent({
              playerId: p.id, playerName: p.name,
              kind: "constraint",
              message: `${p.name} needs to ${p.constraintKind} — ${p.constraintStatus === "relaxing" ? "relaxing now" : "deciding..."}`,
            });
          } else if (!isConstrained && was) {
            const pauseDuration = now - ps.sim.pausedAt;
            ps.sim.startedAt += pauseDuration;
            ps.sim.paused = false;
            ps.sim.pausedAt = 0;
            constraintWasActiveRef.current[p.id] = false;
            ps.constraintTriggered = null;

            pushEvent({
              playerId: p.id, playerName: p.name,
              kind: "constraint_resolved",
              message: `${p.name} is back on the road!`,
            });
          }

          // ── Local constraint detection ─────────────────────────
          if (!ps.sim.paused) {
            const result = simulateTravelTick(ps.sim, now);
            const km = ps.sim.totalKm * result.pAnim;
            ps.travelledKm = km;

            if (!ps.constraintTriggered) {
              if (ps.nextRejuvenateAtKm != null && km >= ps.nextRejuvenateAtKm) {
                ps.constraintTriggered = "rejuvenate";
                const kind = ps.sim.modeId === "walk" || ps.sim.modeId === "bicycle" ? "rejuvenate" : "rest";
                pushEvent({
                  playerId: p.id, playerName: p.name,
                  kind: "constraint",
                  message: `${p.name} has been ${modeLabel(ps.sim.modeId).toLowerCase()}ing for ${km.toFixed(1)}km and needs to ${kind}. Let's see what they decide...`,
                });
                ps.nextRejuvenateAtKm += ps.sim.modeId === "walk" ? WALK_REJUVENATE_EVERY_KM : BIKE_REJUVENATE_EVERY_KM;
              }
              if (ps.nextRefuelAtKm != null && km >= ps.nextRefuelAtKm) {
                ps.constraintTriggered = "refuel";
                pushEvent({
                  playerId: p.id, playerName: p.name,
                  kind: "constraint",
                  message: `${p.name}'s ${modeLabel(ps.sim.modeId).toLowerCase()} is running low on fuel at ${km.toFixed(1)}km!`,
                });
                ps.nextRefuelAtKm += ps.sim.modeId === "motorbike" ? MOTO_REFUEL_EVERY_KM : CAR_REFUEL_EVERY_KM;
              }
              if (ps.nextRestAtKm != null && km >= ps.nextRestAtKm) {
                ps.constraintTriggered = "rest";
                pushEvent({
                  playerId: p.id, playerName: p.name,
                  kind: "constraint",
                  message: `${p.name} has been driving for ${km.toFixed(1)}km and needs a rest stop`,
                });
                ps.nextRestAtKm += DRIVE_REST_EVERY_KM;
              }
            }
          }
        }

        // ── Compute position ─────────────────────────────────────
        let pos: LngLat;
        if (ps) {
          const result = simulateTravelTick(ps.sim, now);
          pos = result.pos;
          if (result.finished) {
            pushEvent({
              playerId: p.id, playerName: p.name,
              kind: "arrived",
              message: `${p.name} has arrived at their destination!`,
            });
            simMapRef.current[p.id] = null;
            simKeyRef.current[p.id] = "";
          }
        } else {
          pos = p.pos;
        }

        marker.setLngLat([pos.lng, pos.lat]);

        // ── Bearing ──────────────────────────────────────────────
        const anchor = bearingAnchorRef.current[p.id];
        if (anchor) {
          if (haversineKm(anchor, pos) >= BEARING_MIN_KM) {
            bearingValRef.current[p.id] = bearingDeg(anchor, pos);
            bearingAnchorRef.current[p.id] = { ...pos };
          }
        } else {
          bearingAnchorRef.current[p.id] = { ...pos };
        }

        // ── Trail ────────────────────────────────────────────────
        const last = lastDisplayedPosRef.current[p.id];
        if (last && (last.lng !== pos.lng || last.lat !== pos.lat)) {
          if (!trailRef.current[p.id]) trailRef.current[p.id] = [];
          trailRef.current[p.id].push({ ...pos });
          if (trailRef.current[p.id].length > TRAIL_MAX)
            trailRef.current[p.id] = trailRef.current[p.id].slice(-TRAIL_MAX);

          const lastSet = trailLastSetRef.current[p.id] ?? 0;
          if (now - lastSet >= TRAIL_INTERVAL) {
            trailLastSetRef.current[p.id] = now;
            const trail = trailRef.current[p.id];
            if (trail && trail.length >= 2) {
              const srcId = "stream-trail-src-" + p.id;
              const lyrId = "stream-trail-lyr-" + p.id;
              const coords = trail.map((t) => [t.lng, t.lat] as [number, number]);
              const gj = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } };
              try {
                if (!map.getSource(srcId)) {
                  map.addSource(srcId, { type: "geojson", data: gj });
                  map.addLayer({
                    id: lyrId, type: "line", source: srcId,
                    layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": playerColorRef.current[p.id] ?? AVATAR_COLORS[0], "line-width": 3, "line-opacity": 0.7 },
                  });
                  trailLayerIdsRef.current.add(p.id);
                } else {
                  (map.getSource(srcId) as any)?.setData(gj);
                }
              } catch {}
            }
          }
        }
        lastDisplayedPosRef.current[p.id] = pos;

        // ── Status pill ──────────────────────────────────────────
        const pill = marker?.getElement?.()?.querySelector?.("[data-status-pill]") as HTMLElement | null;
        if (pill) {
          if (ps && !ps.sim.paused) {
            const pct = Math.round(ps.travelledKm / ps.sim.totalKm * 100);
            pill.style.display = "block";
            pill.style.background = "#10B981";
            pill.style.color = "#fff";
            pill.textContent = `${modeLabel(ps.sim.modeId)} ${pct}%`;
          } else if (ps?.sim.paused) {
            pill.style.display = "block";
            pill.style.background = "#F59E0B";
            pill.style.color = "#fff";
            pill.textContent = p.constraintKind ?? "stopped";
          } else {
            pill.style.display = "none";
          }
        }
      });

      // ── Rotation ─────────────────────────────────────────────────
      Object.keys(markersRef.current).forEach((id) => {
        const b = bearingValRef.current[id];
        const prev = lastBearing[id];
        if (b === prev) return;
        lastBearing[id] = b ?? null;
        const el = markersRef.current[id]?.getElement?.() as HTMLElement | undefined;
        const rot = el?.querySelector?.("[data-marker-rotate]") as HTMLElement | null;
        if (rot) {
          rot.style.transition = "transform 0.6s ease-out";
          rot.style.transform = b != null ? `rotate(${b}deg)` : "";
        }
      });
    }, 16);

    return () => clearInterval(interval);
  }, [mapReady, pushEvent]);

  // ─── Camera follow ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !focusId) return;
    const map = mapRef.current;
    if (!map) return;

    cameraLastRef.current = { pos: null, at: 0 };

    const interval = window.setInterval(() => {
      const pos = lastDisplayedPosRef.current[focusId];
      if (!pos) return;
      const last = cameraLastRef.current;
      const moved = last.pos ? haversineKm(last.pos, pos) : Infinity;
      if (moved < 0.005 && Date.now() - last.at < 2000) return;
      try {
        map.easeTo({ center: [pos.lng, pos.lat], duration: 1800, zoom: 14 });
        cameraLastRef.current = { pos: { ...pos }, at: Date.now() };
      } catch {}
    }, 2000);

    const pos = lastDisplayedPosRef.current[focusId];
    if (pos) {
      try { map.flyTo({ center: [pos.lng, pos.lat], zoom: 14, duration: 1200 }); } catch {}
      cameraLastRef.current = { pos: { ...pos }, at: Date.now() };
    }

    return () => clearInterval(interval);
  }, [mapReady, focusId]);

  // ─── Fit all on unfocus ─────────────────────────────────────────────────
  useEffect(() => {
    if (focusId || !mapReady || players.length === 0) return;
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    const bounds = new mapboxgl.LngLatBounds();
    players.forEach((p) => bounds.extend([p.pos.lng, p.pos.lat]));
    try { map.fitBounds(bounds, { padding: 60, duration: 1200, maxZoom: 14 }); } catch {}
  }, [focusId, mapReady, players.length]);

  // ─── Focused player data ────────────────────────────────────────────────
  const focusedPlayer = players.find((p) => p.id === focusId) ?? null;
  const focusedSim = focusId ? simMapRef.current[focusId] : null;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "#0F172A", fontFamily: "'Inter', sans-serif" }}>
      {/* Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
        {/* Top bar */}
        <div style={{
          position: "absolute", top: 16, left: 16, right: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          pointerEvents: "none", zIndex: 10,
        }}>
          <div style={{
            background: "rgba(15,23,42,0.85)", backdropFilter: "blur(12px)",
            padding: "8px 16px", borderRadius: 12, color: "#fff",
            fontSize: 14, fontWeight: 700, pointerEvents: "auto",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>live_tv</span>
            {hunt?.name ?? "Loading..."}
            <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>{players.length} players</span>
          </div>
          {focusId && (
            <button
              onClick={() => setFocusId(null)}
              style={{
                background: "rgba(15,23,42,0.85)", backdropFilter: "blur(12px)",
                padding: "8px 16px", borderRadius: 12, color: "#fff", border: "none",
                fontSize: 12, fontWeight: 600, cursor: "pointer", pointerEvents: "auto",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}>grid_view</span>
              Show All
            </button>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div style={{
        width: 360, background: "#1E293B", borderLeft: "1px solid #334155",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Focused player card */}
        {focusedPlayer && (
          <div style={{ padding: 16, borderBottom: "1px solid #334155" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
                border: `2px solid ${playerColorRef.current[focusedPlayer.id] ?? "#6366F1"}`,
                background: "#fff", flexShrink: 0,
              }}>
                {focusedPlayer.avatarUrl && (
                  <img src={focusedPlayer.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#F8FAFC", fontWeight: 700, fontSize: 14 }}>{focusedPlayer.name}</div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: "middle" }}>vpn_key</span>
                  {" "}{focusedPlayer.keys}/{focusedPlayer.keysToWin} keys
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#94A3B8" }}>
                {modeIcon(focusedPlayer.travelMode)}
              </span>
            </div>

            {focusedSim && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                  <span>{modeLabel(focusedSim.sim.modeId)} — {focusedSim.travelledKm.toFixed(1)}km / {focusedSim.sim.totalKm.toFixed(1)}km</span>
                  <span>{Math.round(focusedSim.travelledKm / focusedSim.sim.totalKm * 100)}%</span>
                </div>
                <div style={{ height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: `${Math.min(100, focusedSim.travelledKm / focusedSim.sim.totalKm * 100)}%`,
                    background: focusedSim.sim.paused ? "#F59E0B" : "#10B981",
                  }} />
                </div>
                {focusedSim.sim.paused && focusedPlayer.constraintKind && (
                  <div style={{
                    marginTop: 8, padding: "6px 10px", borderRadius: 8,
                    background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
                    color: "#FBBF24", fontSize: 11, fontWeight: 600,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }}>warning</span>
                    {focusedPlayer.constraintKind === "rejuvenate" && "Needs to rest / rejuvenate"}
                    {focusedPlayer.constraintKind === "refuel" && "Running low on fuel"}
                    {focusedPlayer.constraintKind === "rest" && "Driver needs a rest stop"}
                    {" — "}{focusedPlayer.constraintStatus ?? "deciding"}
                  </div>
                )}
                {focusedSim.constraintTriggered && !focusedSim.sim.paused && (
                  <div style={{
                    marginTop: 8, padding: "6px 10px", borderRadius: 8,
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    color: "#A5B4FC", fontSize: 11, fontWeight: 600,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }}>hourglass_top</span>
                    {focusedSim.constraintTriggered} threshold reached — waiting for player action...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Player list */}
        <div style={{ padding: "8px 0", borderBottom: "1px solid #334155", flex: "0 0 auto", maxHeight: "40%", overflowY: "auto" }}>
          <div style={{ padding: "4px 16px 8px", color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Players ({players.length})
          </div>
          {players.map((p) => {
            const sim = simMapRef.current[p.id];
            const isFocused = p.id === focusId;
            return (
              <div
                key={p.id}
                onClick={() => setFocusId(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 16px", cursor: "pointer",
                  background: isFocused ? "rgba(99,102,241,0.15)" : "transparent",
                  borderLeft: isFocused ? "3px solid #6366F1" : "3px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", overflow: "hidden",
                  border: `2px solid ${playerColorRef.current[p.id] ?? "#6366F1"}`,
                  background: "#fff", flexShrink: 0,
                }}>
                  {p.avatarUrl && <img src={p.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ color: "#64748B", fontSize: 10 }}>
                    {sim ? `${modeLabel(sim.sim.modeId)} ${Math.round(sim.travelledKm / sim.sim.totalKm * 100)}%` : "idle"}
                    {sim?.sim.paused && " · paused"}
                  </div>
                </div>
                <div style={{ color: "#94A3B8", fontSize: 11, flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: "middle" }}>vpn_key</span>
                  {" "}{p.keys}
                </div>
              </div>
            );
          })}
        </div>

        {/* Narrator feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ padding: "4px 16px 8px", color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: "middle", marginRight: 4 }}>mic</span>
            Narrator Feed
          </div>
          {narratorEvents.length === 0 && (
            <div style={{ padding: "12px 16px", color: "#475569", fontSize: 12, fontStyle: "italic" }}>
              Waiting for action...
            </div>
          )}
          {narratorEvents.map((ev) => (
            <div
              key={ev.id}
              onClick={() => setFocusId(ev.playerId)}
              style={{
                padding: "6px 16px", cursor: "pointer",
                borderLeft: `3px solid ${
                  ev.kind === "constraint" ? "#F59E0B" :
                  ev.kind === "arrived" ? "#10B981" :
                  ev.kind === "constraint_resolved" ? "#6366F1" :
                  "#334155"
                }`,
              }}
            >
              <div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.4 }}>
                {ev.message}
              </div>
              <div style={{ color: "#475569", fontSize: 9, marginTop: 2 }}>
                {new Date(ev.time).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
