"use client";

/**
 * Live-view: same logic as hunts page, but read-only. No user interaction.
 * - Start: from locator (stored in player_positions when user clicks locator).
 * - Movement: user opens travel, chooses mode, clicks Go/Rent/Board → we store route + start + duration; avatar moves using same interpolation as hunts.
 * - Stop/constraint/quiz: same triggers as hunts; we show modals with the narrative (what does Loota decide? Loota chose to continue / going to rest; relaxing; paid and keep moving; at quiz).
 */
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import "mapbox-gl/dist/mapbox-gl.css";
import { positionAlongRoute, parseWaypointCoords } from "@/app/hunts/utils";
import type { LngLat } from "@/app/hunts/types";
import { makeAvatarEl } from "@/app/hunts/mapMarkerFactories";
import { TRAVEL_MODES } from "@/app/hunts/constants";
import { addMapboxTrafficLayer } from "@/lib/mapbox-traffic-layer";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DEFAULT_CENTER: LngLat = { lng: 8.5, lat: 9.5 };
const DEFAULT_ZOOM = 14;
const AVATAR_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#EF4444"];

const CONSTRAINT_KIND_LABEL: Record<string, string> = {
  rest: "rest",
  refuel: "refuel",
  rejuvenate: "rejuvenation",
};

const MODE_LABEL: Record<string, string> = {
  walk: "walking",
  bicycle: "cycling",
  motorbike: "riding",
  car: "driving",
  bus: "on the bus",
  plane: "flying",
};

type ConstraintState = {
  status: "to_stop" | "relaxing" | "ready_to_pay";
  kind: string;
  startedAt?: number;
  actionSeconds?: number;
  stop?: { place_name?: string };
};

type PlayerAction = {
  action_type: string;
  payload?: { choice?: string; kind?: string };
  created_at: string;
};

type PlayerState = {
  id: string;
  name: string;
  avatarUrl: string | null;
  pos: LngLat;
  keys: number;
  keysToWin: number;
  travelMode: string;
  travel_started_at: string | null;
  travel_route_coords: [number, number][] | null;
  travel_duration_ms: number | null;
  constraintState: ConstraintState | null;
  answeringQuestion: boolean;
  currentQuestionText: string | null;
  lastConstraintChoice: PlayerAction | null;
  lastConstraintExited: PlayerAction | null;
};

function normalizeRoute(raw: unknown): [number, number][] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const ok = raw.every(
    (pt) => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === "number" && typeof pt[1] === "number"
  );
  return ok ? (raw as [number, number][]) : null;
}

function travelIcon(modeId: string): string {
  const m = TRAVEL_MODES.find((x) => x.id === modeId);
  return m?.icon ?? "directions_walk";
}

export type LiveViewContentProps = {
  huntId: string;
  backHref?: string;
  backLabel?: string;
  /** When true, use h-full so the component fills its container (e.g. when embedded in admin). */
  embedded?: boolean;
  /** When true, fetch hunt via admin API (server session) to avoid client RLS/session issues. */
  useAdminApi?: boolean;
};

export function LiveViewContent({ huntId, backHref = "/", backLabel = "← Back", embedded, useAdminApi }: LiveViewContentProps) {

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  const [hunt, setHunt] = useState<{
    id: string;
    title: string;
    keys_to_win: number;
    waypoints: unknown[];
    start_lng: number | null;
    start_lat: number | null;
  } | null>(null);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const actionsByPlayerRef = useRef<Record<string, { lastChoice: PlayerAction | null; lastExited: PlayerAction | null }>>({});

  const playersRef = useRef<PlayerState[]>([]);
  playersRef.current = players;

  const focusPlayer = focusId ? players.find((p) => p.id === focusId) : null;

  // Load hunt + player_positions + recent hunt_player_actions
  useEffect(() => {
    if (!huntId || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let huntData: {
          id: string;
          title: string;
          keys_to_win: number;
          waypoints: unknown[];
          start_lng?: number | null;
          start_lat?: number | null;
          status?: string;
        } | null = null;

        if (useAdminApi) {
          // Fetch via admin API so server session is used (avoids client RLS/session issues)
          const res = await fetch(`/api/admin/hunts/${encodeURIComponent(huntId)}`);
          if (cancelled) return;
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const msg = (body as { error?: string }).error || res.statusText;
            setError(msg || "Could not load hunt. Please try again.");
            setLoading(false);
            return;
          }
          huntData = await res.json();
        } else {
          await supabase.auth.getSession();
          if (cancelled) return;
          const { data, error: huntErr } = await supabase
            .from("hunts")
            .select("id, title, keys_to_win, waypoints, status")
            .eq("id", huntId)
            .maybeSingle();
          if (cancelled) return;
          if (huntErr) {
            setError(huntErr.message || "Could not load hunt. Please try again.");
            setLoading(false);
            return;
          }
          huntData = data;
        }

        if (!huntData) {
          setError("Hunt not found. Check the link or open it from Admin → Live View.");
          setLoading(false);
          return;
        }
        const statusStr = (huntData.status ?? "").toString().toLowerCase();
        if (statusStr !== "active" && statusStr !== "draft") {
          setError("This hunt has ended or is not available for live view.");
          setLoading(false);
          return;
        }
        setHunt({
          id: huntData.id,
          title: huntData.title,
          keys_to_win: huntData.keys_to_win ?? 0,
          waypoints: Array.isArray(huntData.waypoints) ? huntData.waypoints : [],
          start_lng: huntData.start_lng != null ? Number(huntData.start_lng) : null,
          start_lat: huntData.start_lat != null ? Number(huntData.start_lat) : null,
        });

        const [posRes, actionsRes] = await Promise.all([
          supabase
            .from("player_positions")
            .select("player_id, player_name, lng, lat, keys, travel_mode, travel_started_at, travel_route_coords, travel_duration_ms, constraint_state, answering_question, current_question")
            .eq("hunt_id", huntId),
          supabase
            .from("hunt_player_actions")
            .select("player_id, action_type, payload, created_at")
            .eq("hunt_id", huntId)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        if (cancelled) return;

        const posData = posRes.data ?? [];
        const actions = (actionsRes.data ?? []) as Array<{ player_id: string; action_type: string; payload?: unknown; created_at: string }>;
        const byPlayer: Record<string, { lastChoice: PlayerAction | null; lastExited: PlayerAction | null }> = {};
        actions.forEach((a) => {
          const pid = a.player_id;
          if (!byPlayer[pid]) byPlayer[pid] = { lastChoice: null, lastExited: null };
          const act: PlayerAction = { action_type: a.action_type, payload: a.payload as any, created_at: a.created_at };
          if (a.action_type === "constraint_choice" && !byPlayer[pid].lastChoice) byPlayer[pid].lastChoice = act;
          if (a.action_type === "constraint_exited" && !byPlayer[pid].lastExited) byPlayer[pid].lastExited = act;
        });
        actionsByPlayerRef.current = byPlayer;

        const playerIds = [...new Set(posData.map((p: any) => p.player_id))];
        const { data: profiles } = await supabase
          .from("player_profiles")
          .select("user_id, avatar_url")
          .in("user_id", playerIds);
        const avatarBy = new Map<string, string | null>();
        (profiles ?? []).forEach((pr: any) => avatarBy.set(pr.user_id, pr.avatar_url ?? null));

        const list: PlayerState[] = posData.map((p: any) => {
          const cs = p.constraint_state;
          let constraintState: ConstraintState | null = null;
          if (cs && typeof cs === "object" && ["to_stop", "relaxing", "ready_to_pay"].includes((cs as any).status) && ["refuel", "rest", "rejuvenate"].includes((cs as any).kind)) {
            const c = cs as any;
            const startedAt = typeof c.startedAt === "number" ? c.startedAt : typeof c.startedAt === "string" ? new Date(c.startedAt).getTime() : undefined;
            constraintState = {
              status: c.status,
              kind: c.kind,
              startedAt: Number.isFinite(startedAt) ? startedAt : undefined,
              actionSeconds: typeof c.actionSeconds === "number" ? c.actionSeconds : undefined,
              stop: c.stop,
            };
          }
          const routeCoords = normalizeRoute(p.travel_route_coords);
          const durationMs = typeof p.travel_duration_ms === "number" && Number.isFinite(p.travel_duration_ms) ? p.travel_duration_ms : null;
          const ap = byPlayer[p.player_id];
          const startedAt = p.travel_started_at ? new Date(p.travel_started_at).getTime() : 0;
          const dur = durationMs ?? 0;
          const inTravel = startedAt > 0 && dur > 0 && Array.isArray(routeCoords) && routeCoords.length >= 2 && Date.now() >= startedAt && Date.now() <= startedAt + dur;
          let pos: LngLat = { lng: Number(p.lng), lat: Number(p.lat) };
          if (inTravel && routeCoords) pos = positionAlongRoute(routeCoords, startedAt, dur);
          return {
            id: p.player_id,
            name: p.player_name || "Loota",
            avatarUrl: avatarBy.get(p.player_id) ?? null,
            pos,
            keys: p.keys ?? 0,
            keysToWin: huntData.keys_to_win ?? 0,
            travelMode: p.travel_mode || "walk",
            travel_started_at: p.travel_started_at ?? null,
            travel_route_coords: routeCoords,
            travel_duration_ms: durationMs,
            constraintState,
            answeringQuestion: Boolean(p.answering_question),
            currentQuestionText: typeof p.current_question === "string" ? p.current_question : null,
            lastConstraintChoice: ap?.lastChoice ?? null,
            lastConstraintExited: ap?.lastExited ?? null,
          };
        });
        setPlayers(list);
      } catch (e) {
        if (!cancelled) setError("Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [huntId, supabase, useAdminApi]);

  // Realtime: player_positions
  useEffect(() => {
    if (!huntId || !supabase || !hunt) return;
    const ch = supabase
      .channel(`live-pos-${huntId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_positions", filter: `hunt_id=eq.${huntId}` },
        (payload: { new?: any }) => {
          const n = payload.new;
          if (!n) return;
          const routeCoords = normalizeRoute(n.travel_route_coords);
          const durationMs = typeof n.travel_duration_ms === "number" && Number.isFinite(n.travel_duration_ms) ? n.travel_duration_ms : null;
          const cs = n.constraint_state;
          let constraintState: ConstraintState | null = null;
          if (cs && typeof cs === "object" && ["to_stop", "relaxing", "ready_to_pay"].includes((cs as any).status) && ["refuel", "rest", "rejuvenate"].includes((cs as any).kind)) {
            const c = cs as any;
            const startedAt = typeof c.startedAt === "number" ? c.startedAt : typeof c.startedAt === "string" ? new Date(c.startedAt).getTime() : undefined;
            constraintState = {
              status: c.status,
              kind: c.kind,
              startedAt: Number.isFinite(startedAt) ? startedAt : undefined,
              actionSeconds: typeof c.actionSeconds === "number" ? c.actionSeconds : undefined,
              stop: c.stop,
            };
          }
          const next: PlayerState = {
            id: n.player_id,
            name: n.player_name || "Loota",
            avatarUrl: null,
            pos: { lng: Number(n.lng), lat: Number(n.lat) },
            keys: n.keys ?? 0,
            keysToWin: hunt.keys_to_win ?? 0,
            travelMode: n.travel_mode || "walk",
            travel_started_at: n.travel_started_at ?? null,
            travel_route_coords: routeCoords,
            travel_duration_ms: durationMs,
            constraintState,
            answeringQuestion: Boolean(n.answering_question),
            currentQuestionText: typeof n.current_question === "string" ? n.current_question : null,
            lastConstraintChoice: actionsByPlayerRef.current[n.player_id]?.lastChoice ?? null,
            lastConstraintExited: actionsByPlayerRef.current[n.player_id]?.lastExited ?? null,
          };
          const startedAt = next.travel_started_at ? new Date(next.travel_started_at).getTime() : 0;
          const dur = next.travel_duration_ms ?? 0;
          if (startedAt > 0 && dur > 0 && Array.isArray(next.travel_route_coords) && next.travel_route_coords.length >= 2) {
            const now = Date.now();
            if (now >= startedAt && now <= startedAt + dur) next.pos = positionAlongRoute(next.travel_route_coords, startedAt, dur);
          }
          setPlayers((prev) => {
            const existing = prev.find((p) => p.id === n.player_id);
            if (existing) {
              next.avatarUrl = existing.avatarUrl;
              next.lastConstraintChoice = existing.lastConstraintChoice;
              next.lastConstraintExited = existing.lastConstraintExited;
            }
            if (existing) return prev.map((p) => (p.id === n.player_id ? next : p));
            return [...prev, next];
          });
        }
      )
      .subscribe();
    return () => ch.unsubscribe();
  }, [huntId, supabase, hunt?.keys_to_win]);

  // Realtime: hunt_player_actions (constraint_choice, constraint_exited)
  useEffect(() => {
    if (!huntId || !supabase) return;
    const ch = supabase
      .channel(`live-actions-${huntId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hunt_player_actions", filter: `hunt_id=eq.${huntId}` },
        (payload: { new?: any }) => {
          const n = payload.new;
          if (!n) return;
          const pid = n.player_id;
          const act: PlayerAction = {
            action_type: n.action_type,
            payload: n.payload ?? undefined,
            created_at: n.created_at,
          };
          if (n.action_type === "constraint_choice") {
            actionsByPlayerRef.current[pid] = { ...actionsByPlayerRef.current[pid], lastChoice: act };
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === pid ? { ...p, lastConstraintChoice: act } : p
              )
            );
          } else if (n.action_type === "constraint_exited") {
            actionsByPlayerRef.current[pid] = { ...actionsByPlayerRef.current[pid], lastExited: act };
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === pid ? { ...p, lastConstraintExited: act } : p
              )
            );
          }
        }
      )
      .subscribe();
    return () => ch.unsubscribe();
  }, [huntId, supabase]);

  // Map init: center on hunt location (start_lng/start_lat, then first waypoint, then default)
  useEffect(() => {
    if (!MAPBOX_TOKEN || loading || !hunt) return;
    let cancelled = false;
    let c: LngLat = DEFAULT_CENTER;
    if (hunt.start_lng != null && hunt.start_lat != null && Number.isFinite(hunt.start_lng) && Number.isFinite(hunt.start_lat)) {
      c = { lng: hunt.start_lng, lat: hunt.start_lat };
    } else {
      const wp = hunt.waypoints;
      if (Array.isArray(wp) && wp.length > 0) {
        const coords = parseWaypointCoords(wp[0]);
        if (coords) c = coords;
      }
    }
    (async () => {
      if (mapRef.current || !mapContainerRef.current) return;
      const mapboxgl = (await import("mapbox-gl")).default as any;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      mapboxRef.current = mapboxgl;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [c.lng, c.lat],
        zoom: DEFAULT_ZOOM,
        interactive: false,
      });
      mapRef.current = map;
      map.on("load", () => {
        if (!cancelled) map.resize();
        try {
          addMapboxTrafficLayer(map);
        } catch {
          /* optional */
        }
        setMapReady(true);
      });
    })();
    return () => {
      cancelled = true;
      Object.values(markersRef.current).forEach((m) => m?.remove?.());
      markersRef.current = {};
      mapRef.current?.remove?.();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [loading, hunt]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapReady || !mapboxgl?.Marker) return;
    players.forEach((p, idx) => {
      if (markersRef.current[p.id]) return;
      const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const avatarUrl = p.avatarUrl || `https://api.dicebear.com/8.x/thumbs/svg?seed=${p.id}`;
      const el = makeAvatarEl(avatarUrl, color);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.pos.lng, p.pos.lat])
        .addTo(map);
      marker.getElement()?.addEventListener("click", () => setFocusId((f) => (f === p.id ? null : p.id)));
      markersRef.current[p.id] = marker;
    });
    Object.keys(markersRef.current).forEach((id) => {
      if (!players.some((p) => p.id === id)) {
        markersRef.current[id]?.remove();
        delete markersRef.current[id];
      }
    });
  }, [mapReady, players]);

  // Animation: same as hunts — position from route + time
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let rafId: number;
    const tick = () => {
      const list = playersRef.current;
      list.forEach((p) => {
        const marker = markersRef.current[p.id];
        if (!marker) return;
        const startedAt = p.travel_started_at ? new Date(p.travel_started_at).getTime() : 0;
        const durationMs = p.travel_duration_ms ?? 0;
        const coords = p.travel_route_coords;
        const isTraveling =
          startedAt > 0 &&
          durationMs > 0 &&
          Array.isArray(coords) &&
          coords.length >= 2 &&
          Date.now() >= startedAt &&
          Date.now() <= startedAt + durationMs;
        const pos = isTraveling ? positionAlongRoute(coords, startedAt, durationMs) : p.pos;
        marker.setLngLat([pos.lng, pos.lat]);
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady]);

  // Modal content for focused player (read-only narrative) — same flow as hunts, no interaction
  const modalMessage = (() => {
    if (!focusPlayer) return null;
    const cs = focusPlayer.constraintState;
    const choice = focusPlayer.lastConstraintChoice?.payload as { choice?: string; kind?: string } | undefined;
    const kindLabel = CONSTRAINT_KIND_LABEL[cs?.kind ?? ""] ?? cs?.kind ?? "rest";
    const modeLabel = MODE_LABEL[focusPlayer.travelMode] ?? "moving";

    if (focusPlayer.answeringQuestion) {
      return {
        title: "At the challenge",
        body: focusPlayer.currentQuestionText ? `Question: ${focusPlayer.currentQuestionText}` : "This Loota is answering the quiz.",
      };
    }
    if (cs?.status === "to_stop") {
      if (choice?.choice === "keep_going") {
        return { title: "Decision", body: "Wow, the Loota chooses to continue." };
      }
      if (choice?.choice === "go_to_stop") {
        return {
          title: "Going to stop",
          body: `Wow, the Loota is going to ${kindLabel} to keep his energy.`,
        };
      }
      return {
        title: "Needs a break",
        body: `Wow, this Loota has been ${modeLabel} for too long and needs a ${kindLabel}. What does he decide?`,
      };
    }
    if (cs?.status === "relaxing") {
      const startedAt = cs.startedAt ?? Date.now();
      const actionSec = cs.actionSeconds ?? 180;
      const elapsed = (Date.now() - startedAt) / 1000;
      const progress = Math.min(1, elapsed / actionSec);
      const pct = Math.round(progress * 100);
      return {
        title: "Relaxing",
        body: `The user is relaxing here to boost their energy. Progress: ${pct}%${progress >= 1 ? " — done, ready to pay." : ""}`,
      };
    }
    if (cs?.status === "ready_to_pay") {
      return {
        title: "Ready to pay",
        body: "The user has finished and is ready to pay to keep moving.",
      };
    }
    if (focusPlayer.lastConstraintExited && !cs) {
      return {
        title: "Paid and moving",
        body: "User has paid and keep moving.",
      };
    }
    return null;
  })();

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white">
        <p className="text-lg font-bold">Live view unavailable</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white">
        <p className="text-lg">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white">
        <p className="text-lg font-bold text-red-300">{error}</p>
        <Link href={backHref} className="mt-4 text-sm text-white/70 hover:underline">{backLabel}</Link>
      </div>
    );
  }

  return (
    <div className={`relative w-full bg-[#0F172A] ${embedded ? "h-full" : "h-screen"}`}>
      <div className="absolute inset-0 flex">
        <div ref={mapContainerRef} className="flex-1 w-full h-full" />
        <aside className="w-80 border-l border-white/10 bg-[#0F172A]/95 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <Link href={backHref} className="text-sm text-white/70 hover:underline">{backLabel}</Link>
            <span className="text-xs text-white/50 font-medium">Live view · {hunt?.title ?? "Hunt"}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFocusId((f) => (f === p.id ? null : p.id))}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  focusId === p.id ? "border-indigo-400 bg-indigo-950/50" : "border-white/10 hover:bg-white/5"
                }`}
              >
                <span className="font-medium text-white truncate block">{p.name}</span>
                <span className="text-xs text-white/60">
                  {p.keys}/{p.keysToWin} keys · {travelIcon(p.travelMode)}
                </span>
                {p.constraintState && <span className="text-amber-300 text-xs"> · Stop</span>}
                {p.answeringQuestion && <span className="text-indigo-300 text-xs"> · Quiz</span>}
              </button>
            ))}
          </div>
          {focusPlayer && (
            <div className="p-3 border-t border-white/10 text-sm text-white/90 space-y-2">
              <p className="font-bold text-white">{focusPlayer.name}</p>
              <p>{focusPlayer.keys}/{focusPlayer.keysToWin} keys</p>
              {focusPlayer.constraintState && (
                <p className="text-amber-300">{focusPlayer.constraintState.kind} — {focusPlayer.constraintState.status}</p>
              )}
              {focusPlayer.answeringQuestion && (
                <p className="text-indigo-300">
                  At quiz{focusPlayer.currentQuestionText ? `: ${focusPlayer.currentQuestionText.slice(0, 60)}…` : ""}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Read-only modal: narrative for focused player */}
      {focusPlayer && modalMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 p-4">
          <div className="bg-[#1e293b] border border-white/20 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-white mb-2">{modalMessage.title}</h3>
            <p className="text-white/90">{modalMessage.body}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setFocusId(null)}
                className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LiveViewPage() {
  const params = useParams<{ huntId: string }>();
  const huntId = typeof params?.huntId === "string" ? params.huntId : Array.isArray(params?.huntId) ? params.huntId[0] : "";
  if (!huntId) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-white">
        <p className="text-lg font-bold text-red-300">No hunt selected.</p>
        <Link href="/" className="mt-4 text-sm text-white/70 hover:underline">Back</Link>
      </div>
    );
  }
  return <LiveViewContent huntId={huntId} backHref="/" backLabel="← Back" />;
}
