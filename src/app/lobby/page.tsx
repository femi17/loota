"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppFooter } from "@/components/AppFooter";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { getRegisterGeolocation } from "@/lib/register-geolocation";
import { fetchRegionMapViewForHuntCached, fetchRegionMapViewForQuery } from "@/lib/region-map-view";
import { stableDeviceSpawnSpreadLngLat, stableSpawnSpreadLngLat } from "@/lib/spawn-spread";
import {
  normalizePlayerIdForDb,
  roundLngLatForPlayerPositionsDb,
} from "@/lib/player-positions-db";

function formatCountdown(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

type Hunt = {
  id: string;
  title: string;
  description: string;
  briefing: string;
  prize: string;
  prize_pool: number;
  number_of_winners: number;
  number_of_hunts?: number;
  entry_requirement: number;
  image_url: string | null;
  start_date: string;
  end_date: string;
  keys_to_win: number;
  /** First quiz location — optional; spawn uses hunt state/region, not waypoints */
  waypoints?: Array<{ label?: string; lng?: number; lat?: number }> | null;
  hunt_location?: string | null;
  region_name?: string | null;
};

type HuntRegistration = {
  id: string;
  player_id: string;
  registered_at: string;
  player_profiles: {
    username: string;
    avatar_url: string | null;
    level: number;
  } | null;
};

type LobbyMessage = {
  id: string;
  hunt_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_avatar_url: string | null;
  body: string;
  created_at: string;
};

const MAX_CHAT_BODY_LENGTH = 500;

async function upsertPlayerPositionOnRegister(
  hunt: Hunt,
  userId: string,
  playerName: string
): Promise<{ ok: boolean; error?: string }> {
  const geo = await getRegisterGeolocation();
  let lng: number;
  let lat: number;
  if (geo) {
    const s = stableDeviceSpawnSpreadLngLat(hunt.id, userId, geo.lng, geo.lat);
    lng = s.lng;
    lat = s.lat;
  } else {
    let view;
    try {
      view = await fetchRegionMapViewForHuntCached(
        hunt.id,
        hunt.hunt_location ?? null,
        hunt.region_name ?? null
      );
    } catch {
      view = await fetchRegionMapViewForQuery(null);
    }
    const s = stableSpawnSpreadLngLat(hunt.id, userId, view.center.lng, view.center.lat);
    lng = s.lng;
    lat = s.lat;
  }
  const rounded = roundLngLatForPlayerPositionsDb(lng, lat);
  lng = rounded.lng;
  lat = rounded.lat;
  const name = playerName.trim() || "Player";
  const payload: Record<string, unknown> = {
    hunt_id: String(hunt.id).trim().toLowerCase(),
    player_name: name,
    lng,
    lat,
    keys: 0,
    travel_mode: "walk",
  };

  let apiErrorDetail: string | undefined;
  // Prefer server route: uses cookie session so player_id always matches auth.uid() for RLS.
  try {
    const res = await fetch("/api/hunt/ensure-player-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
      code?: string;
      ok?: boolean;
    };
    if (res.ok) return { ok: true };
    apiErrorDetail = [data.error, data.details, data.code].filter(Boolean).join(" — ") || JSON.stringify(data);
    console.error("[Lobby] ensure-player-position API failed:", res.status, data);
  } catch (e) {
    console.error("[Lobby] ensure-player-position fetch error:", e);
    apiErrorDetail = e instanceof Error ? e.message : String(e);
  }

  if (!supabase) {
    return {
      ok: false,
      error:
        apiErrorDetail ??
        "Supabase client not configured and API upsert failed.",
    };
  }

  const { error } = await supabase
    .from("player_positions")
    .upsert(
      {
        ...payload,
        player_id: normalizePlayerIdForDb(userId),
      } as never,
      { onConflict: "hunt_id,player_id" }
    );
  if (error) {
    console.error("[Lobby] player_positions client upsert after register:", error);
    const msg = (error as { message?: string }).message ?? String(error);
    return {
      ok: false,
      error: apiErrorDetail ? `${msg} (API attempt: ${apiErrorDetail})` : msg,
    };
  }
  return { ok: true };
}

export default function LobbyPage() {
  const { user: authUser, profile: authProfile } = useAuth();
  const [activeHunt, setActiveHunt] = useState<Hunt | null>(null);
  const [registrations, setRegistrations] = useState<HuntRegistration[]>([]);
  const [huntRegisteredCount, setHuntRegisteredCount] = useState<number>(0);
  const [totalPlatformUsers, setTotalPlatformUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [registering, setRegistering] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [lobbyMessages, setLobbyMessages] = useState<LobbyMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLinkUrl, setInviteLinkUrl] = useState<string>("");
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const [inviteRewardToast, setInviteRewardToast] = useState<string | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  const recordReferralDone = useRef(false);
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  useEffect(() => {
    const ref = refFromUrl?.trim();
    if (!ref || !authUser?.id || recordReferralDone.current || !uuidLike.test(ref)) return;
    recordReferralDone.current = true;
    fetch("/api/hunt/record-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    }).catch(() => {});
  }, [refFromUrl, authUser?.id]);

  useEffect(() => {
    if (!inviteRewardToast) return;
    const t = setTimeout(() => setInviteRewardToast(null), 4000);
    return () => clearTimeout(t);
  }, [inviteRewardToast]);

  useEffect(() => {
    if (!inviteModalOpen) return;
    setInviteLinkLoading(true);
    setInviteLinkUrl("");
    fetch("/api/hunt/create-referral-link", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.url) setInviteLinkUrl(data.url);
      })
      .finally(() => setInviteLinkLoading(false));
  }, [inviteModalOpen]);

  // Fetch active hunt and registrations
  useEffect(() => {
    async function fetchLobbyData() {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

        // Total users on the platform (for Active Lootas denominator)
        const { count: platformCount } = await supabase
          .from("player_profiles")
          .select("user_id", { count: "exact", head: true });
        setTotalPlatformUsers(typeof platformCount === "number" ? platformCount : null);

        // Fetch active hunt
        const { data: hunts, error: huntError } = await supabase
          .from("hunts")
          .select("*")
          .eq("status", "active")
          .order("start_date", { ascending: true })
          .limit(1)
          .single();

        if (huntError && huntError.code !== "PGRST116") {
          console.error("Error fetching active hunt:", huntError);
        } else if (hunts) {
          setActiveHunt(hunts);
          
          // Calculate countdown
          const startDate = new Date(hunts.start_date);
          const now = new Date();
          const diff = Math.floor((startDate.getTime() - now.getTime()) / 1000);
          setSecondsRemaining(Math.max(0, diff));

          // Count of players registered for this hunt
          const { count: huntCount } = await supabase
            .from("hunt_registrations")
            .select("id", { count: "exact", head: true })
            .eq("hunt_id", hunts.id);
          setHuntRegisteredCount(typeof huntCount === "number" ? huntCount : 0);

          // Fetch registrations (no embed - no FK from hunt_registrations to player_profiles)
          const { data: regs, error: regError } = await supabase
            .from("hunt_registrations")
            .select("id, player_id, registered_at")
            .eq("hunt_id", hunts.id)
            .order("registered_at", { ascending: false })
            .limit(50);

          if (regError) {
            console.error("Error fetching registrations:", regError);
          } else if (regs?.length) {
            const playerIds = [...new Set(regs.map((r: { player_id: string }) => r.player_id))];
            const { data: profiles } = await supabase
              .from("player_profiles")
              .select("user_id, username, avatar_url, level")
              .in("user_id", playerIds);
            const profileByUserId = new Map(
              (profiles || []).map((p: { user_id: string; username: string; avatar_url: string | null; level: number }) => [p.user_id, p])
            );
            const merged: HuntRegistration[] = regs.map((r: { id: string; player_id: string; registered_at: string }) => ({
              id: r.id,
              player_id: r.player_id,
              registered_at: r.registered_at,
              player_profiles: profileByUserId.get(r.player_id) ?? null,
            }));
            setRegistrations(merged);
          } else {
            setRegistrations([]);
          }
        }
      } catch (error) {
        console.error("Error fetching lobby data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchLobbyData();
  }, []);

  // Update countdown timer
  useEffect(() => {
    if (!activeHunt) return;

    const t = window.setInterval(() => {
      const startDate = new Date(activeHunt.start_date);
      const now = new Date();
      const diff = Math.floor((startDate.getTime() - now.getTime()) / 1000);
      setSecondsRemaining(Math.max(0, diff));
    }, 1000);
    
    return () => window.clearInterval(t);
  }, [activeHunt]);

  // Fetch lobby messages when active hunt is set
  useEffect(() => {
    if (!activeHunt?.id || !supabase) return;

    let cancelled = false;
    setMessagesLoading(true);

    supabase
      .from("lobby_messages")
      .select("id, hunt_id, sender_id, sender_username, sender_avatar_url, body, created_at")
      .eq("hunt_id", activeHunt.id)
      .order("created_at", { ascending: true })
      .limit(100)
      .then((result: { data: LobbyMessage[] | null; error: unknown }) => {
        const { data, error } = result;
        if (cancelled) return;
        if (error) {
          console.error("Error fetching lobby messages:", error);
          setLobbyMessages([]);
        } else {
          setLobbyMessages(data ?? []);
        }
        setMessagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeHunt?.id]);

  // Poll for new lobby messages (no Realtime required)
  const POLL_INTERVAL_MS = 3000;
  useEffect(() => {
    if (!activeHunt?.id || !supabase) return;

    const poll = () => {
      supabase
        .from("lobby_messages")
        .select("id, hunt_id, sender_id, sender_username, sender_avatar_url, body, created_at")
        .eq("hunt_id", activeHunt.id)
        .order("created_at", { ascending: true })
        .limit(100)
        .then((result: { data: LobbyMessage[] | null; error: unknown }) => {
          const { data, error } = result;
          if (error) return;
          setLobbyMessages(data ?? []);
        });
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [activeHunt?.id]);

  // Scroll chat to bottom when messages change
  useEffect(() => {
    chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: "smooth" });
  }, [lobbyMessages]);

  const sendMessage = useCallback(async () => {
    const body = chatInput.trim();
    if (!body || !activeHunt?.id || !currentUserId || sendingMessage) return;
    if (body.length > MAX_CHAT_BODY_LENGTH) return;

    setSendingMessage(true);
    setChatInput("");

    const sender_username = authProfile?.username ?? null;
    const sender_avatar_url = authProfile?.avatar_url ?? null;

    const { error } = await supabase.from("lobby_messages").insert({
      hunt_id: activeHunt.id,
      sender_id: currentUserId,
      sender_username: sender_username,
      sender_avatar_url: sender_avatar_url,
      body,
    });

    if (error) {
      console.error("Error sending lobby message:", error);
      setChatInput(body);
    }
    setSendingMessage(false);
  }, [activeHunt?.id, chatInput, currentUserId, sendingMessage, authProfile?.username, authProfile?.avatar_url]);

  const { minutes, seconds } = useMemo(
    () => formatCountdown(secondsRemaining),
    [secondsRemaining],
  );

  const huntIsLive = secondsRemaining <= 0;
  const registeredCount = registrations.length;

  // Derived from hunt_registrations: disable Join button and show avatar when user has joined
  const isRegistered = Boolean(
    currentUserId && registrations.some((r) => r.player_id === currentUserId),
  );

  // Show current user first in the list so their avatar always appears when joined, then others (max 5)
  const displayedPlayers = useMemo(() => {
    const mine = currentUserId
      ? registrations.find((r) => r.player_id === currentUserId)
      : null;
    const rest = registrations.filter((r) => r.player_id !== currentUserId);
    return mine ? [mine, ...rest.slice(0, 4)] : rest.slice(0, 5);
  }, [registrations, currentUserId]);

  // Handle registration
  async function handleRegister() {
    if (!activeHunt || !currentUserId || isRegistered || registering) return;

    setRegistering(true);
    try {
      const { error } = await supabase
        .from("hunt_registrations")
        .insert({
          hunt_id: activeHunt.id,
          player_id: currentUserId,
        });

      if (error) {
        if (error.code === "23505") {
          // Already registered — refresh registrations + profiles so UI shows you as joined
          const { data: regs } = await supabase
            .from("hunt_registrations")
            .select("id, player_id, registered_at")
            .eq("hunt_id", activeHunt.id)
            .order("registered_at", { ascending: false })
            .limit(50);
          if (regs?.length) {
            const playerIds = [...new Set(regs.map((r: { player_id: string }) => r.player_id))];
            const { data: profiles } = await supabase
              .from("player_profiles")
              .select("user_id, username, avatar_url, level")
              .in("user_id", playerIds);
            const profileByUserId = new Map(
              (profiles || []).map((p: { user_id: string; username: string; avatar_url: string | null; level: number }) => [p.user_id, p])
            );
            setRegistrations(regs.map((r: { id: string; player_id: string; registered_at: string }) => ({
              id: r.id,
              player_id: r.player_id,
              registered_at: r.registered_at,
              player_profiles: profileByUserId.get(r.player_id) ?? null,
            })));
          }
          if (currentUserId) {
            const posRes = await upsertPlayerPositionOnRegister(
              activeHunt,
              currentUserId,
              (authProfile?.username as string) || "Player"
            );
            if (!posRes.ok) {
              alert(
                `Could not save your position to the database: ${posRes.error ?? "unknown error"}. ` +
                  `Check Supabase RLS policies on player_positions and that the table exists.`
              );
            }
          }
        } else {
          console.error("Error registering for hunt:", error);
          alert("Failed to register for hunt. Please try again.");
        }
      } else {
        // Refresh registrations + profiles so button disables and avatar shows
        const { data: regs } = await supabase
          .from("hunt_registrations")
          .select("id, player_id, registered_at")
          .eq("hunt_id", activeHunt.id)
          .order("registered_at", { ascending: false })
          .limit(50);
        if (regs?.length) {
          const playerIds = [...new Set(regs.map((r: { player_id: string }) => r.player_id))];
          const { data: profiles } = await supabase
            .from("player_profiles")
            .select("user_id, username, avatar_url, level")
            .in("user_id", playerIds);
          const profileByUserId = new Map(
            (profiles || []).map((p: { user_id: string; username: string; avatar_url: string | null; level: number }) => [p.user_id, p])
          );
          setRegistrations(regs.map((r: { id: string; player_id: string; registered_at: string }) => ({
            id: r.id,
            player_id: r.player_id,
            registered_at: r.registered_at,
            player_profiles: profileByUserId.get(r.player_id) ?? null,
          })));
        }
        const posRes = await upsertPlayerPositionOnRegister(
          activeHunt,
          currentUserId,
          (authProfile?.username as string) || "Player"
        );
        if (!posRes.ok) {
          alert(
            `Could not save your position to the database: ${posRes.error ?? "unknown error"}. ` +
              `Check Supabase RLS policies on player_positions and that the table exists.`
          );
        }
        // If user had landed via invite link, credit the referrer (server resolves from pending_hunt_referrals)
        fetch("/api/hunt/credit-invite-reward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data?.ok) setInviteRewardToast("Your inviter earned 500 coins!");
          })
          .catch(() => {});
      }
    } catch (error) {
      console.error("Error registering:", error);
      alert("Failed to register for hunt. Please try again.");
    } finally {
      setRegistering(false);
    }
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-white text-[#0F172A] antialiased">
          <AppHeaderWithAuth active="lobby" />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]"></div>
              <p className="mt-4 text-sm text-slate-600">Loading lobby...</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-white text-[#0F172A] antialiased">
        <AppHeaderWithAuth active="lobby" />

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-8 grid grid-cols-12 gap-6 lg:gap-8">
        {/* Left panel */}
        <div className="col-span-12 lg:col-span-3 space-y-8">
          <section className="space-y-6">
            <div className="aspect-video rounded-3xl overflow-hidden relative soft-shadow">
              {activeHunt?.image_url ? (
                <Image
                  alt="Mission location"
                  src={activeHunt.image_url}
                  fill
                  sizes="(max-width: 1024px) 100vw, 25vw"
                  className="object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-widest border border-white/20">
                  {activeHunt?.title || "No Active Hunt"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-extrabold tracking-tight">
                {activeHunt?.title || "No Active Hunt"}
              </h2>

              {activeHunt && (
                <div className="flex gap-4">
                  <div className="flex-1 p-4 bg-[#F8FAFC] rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Ranked payout
                    </p>
                    <p className="text-lg font-black text-[#10B981]">
                      Top {activeHunt.number_of_winners} share
                    </p>
                  </div>
                  <div className="flex-1 p-4 bg-[#F8FAFC] rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Entry requirement
                    </p>
                    <p className="text-lg font-black text-[#2563EB]">
                      Lvl {activeHunt.entry_requirement}+
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <span className="material-symbols-outlined text-xs font-bold text-slate-400">
                description
              </span>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Hunt Description
              </h3>
            </div>

            {activeHunt ? (
            <div className="space-y-6 text-sm leading-relaxed text-slate-600">
              <div className="space-y-2">
                {activeHunt.briefing ? (
                  <>
                    <p className="font-bold text-[#0F172A]">The Backstory</p>
                    <div className="whitespace-pre-wrap text-slate-600">{activeHunt.briefing}</div>
                  </>
                ) : (
                  <p className="text-slate-500">No briefing for this hunt.</p>
                )}
              </div>

              <div className="space-y-3">
                <p className="font-bold text-[#0F172A]">Objectives</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#2563EB] text-sm mt-0.5">
                      check_circle
                    </span>
                    <span>Earn {activeHunt.keys_to_win} keys by completing {activeHunt.number_of_hunts ?? 0} clue locations.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#2563EB] text-sm mt-0.5">
                      check_circle
                    </span>
                    <span>
                      Choose travel modes strategically (walk, bike, motorbike,
                      car, bus). Rentals include pickup delay.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#2563EB] text-sm mt-0.5">
                      check_circle
                    </span>
                    <span>
                      Manage constraints (fuel, fatigue, stop-actions) to keep
                      momentum.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
            ) : (
              <p className="text-sm text-slate-500">No active hunt. Check back later for the next mission.</p>
            )}
          </section>
        </div>

        {/* Center panel: countdown (hunt start date/time) + big Join Hunt button + active scavengers */}
        <div className="col-span-12 lg:col-span-6 flex flex-col items-center justify-center py-10 lg:py-12 px-4 lg:px-8">
          <div className="text-center space-y-10 w-full max-w-lg">
            {/* Countdown: time until hunt start_date (from hunt config) */}
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-[#2563EB]">
                Synchronization in progress
              </p>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <span className="text-7xl sm:text-8xl font-black tracking-tighter tabular-nums text-[#0F172A]">
                    {minutes}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                    Minutes
                  </p>
                </div>
                <span className="text-5xl font-light text-slate-300 mt-[-2rem]">
                  :
                </span>
                <div className="text-center">
                  <span className="text-7xl sm:text-8xl font-black tracking-tighter tabular-nums text-[#2563EB]">
                    {seconds}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                    Seconds
                  </p>
                </div>
              </div>
              {activeHunt && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Hunt starts {new Date(activeHunt.start_date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </div>

            {/* Big button: Join Hunt (register) or Start Hunting (enter when joined + live) */}
            <div className="space-y-3">
              {activeHunt ? (
                isRegistered ? (
                  huntIsLive ? (
                    <Link
                      href={`/hunt/${activeHunt.id}`}
                      className="block w-full py-7 rounded-2xl font-black text-xl uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-[#0F172A]/20 text-center"
                    >
                      Start Hunting
                    </Link>
                  ) : (
                    <div className="w-full py-7 rounded-2xl font-black text-xl uppercase tracking-[0.2em] bg-[#10B981]/20 text-[#10B981] border-2 border-[#10B981]/30 shadow-xl text-center">
                      You&apos;re in
                    </div>
                  )
                ) : (
                  <>
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed px-1">
                    Allow <strong className="text-slate-700">location</strong> when prompted so the live map shows where you really are (not the hunt state).
                  </p>
                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={registering}
                    className="block w-full py-7 rounded-2xl font-black text-xl uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-[#0F172A]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {registering ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Joining...
                      </span>
                    ) : (
                      "Join Hunt"
                    )}
                  </button>
                  </>
                )
              ) : (
                <button
                  className="block w-full py-7 rounded-2xl font-black text-xl uppercase tracking-[0.2em] bg-[#0F172A]/20 text-[#0F172A]/40 cursor-not-allowed shadow-[#0F172A]/5"
                  disabled
                >
                  No Active Hunt
                </button>
              )}

              <p className="text-[11px] text-slate-400">
                {!activeHunt
                  ? "No hunt scheduled."
                  : huntIsLive && isRegistered
                    ? "Hunt is live. Enter above."
                    : huntIsLive && !isRegistered
                      ? "Join above to enter the hunt."
                      : "... waiting for lobby to fill ..."}
              </p>
            </div>

            {/* Active Lootas: title + badge left, overlapping circles right; then grid row */}
            <div className="w-full pt-12 border-t border-[#F1F5F9]">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-[#0F172A]">
                    Active Lootas
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold tabular-nums">
                    {huntRegisteredCount}/{totalPlatformUsers ?? "—"}
                  </span>
                </div>
                {displayedPlayers.length > 0 && (
                  <div className="flex -space-x-3">
                    {displayedPlayers.slice(0, 2).map((reg) => {
                      const avatarUrl = reg.player_profiles?.avatar_url ||
                        `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(reg.player_id)}`;
                      return (
                        <Image
                          key={reg.id}
                          className="size-8 rounded-full border-2 border-white ring-1 ring-slate-100"
                          alt=""
                          src={avatarUrl}
                          width={32}
                          height={32}
                          unoptimized
                        />
                      );
                    })}
                    {registeredCount > 2 && (
                      <div className="size-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black ring-1 ring-slate-100">
                        +{registeredCount - 2}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
                {displayedPlayers.map((reg) => {
                  const player = reg.player_profiles;
                  const avatarUrl = player?.avatar_url ||
                    `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(reg.player_id)}`;
                  const displayName = player?.username ?? "Player";
                  return (
                    <div
                      key={reg.id}
                      className="group flex flex-col items-center gap-2 sm:gap-3 min-w-0"
                    >
                      <div className="size-14 sm:size-16 rounded-2xl bg-slate-50 border border-slate-100 p-1.5 transition-transform group-hover:-translate-y-1 shrink-0">
                        <Image
                          className="w-full h-full object-cover rounded-xl"
                          alt={`${displayName} avatar`}
                          src={avatarUrl}
                          width={56}
                          height={56}
                          unoptimized
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 text-center truncate w-full px-0.5">
                        {displayName}
                      </span>
                    </div>
                  );
                })}

                <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 ml-4 sm:ml-0 pl-4 sm:pl-0 border-l border-slate-200 sm:border-0">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(true)}
                    className="size-14 sm:size-16 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-[#2563EB] hover:text-[#2563EB] transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined">add</span>
                  </button>
                  <span className="text-[10px] font-bold text-slate-300">
                    Invite
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="col-span-12 lg:col-span-3 flex flex-col space-y-6">
          <div className="flex-1 flex flex-col min-h-0 max-h-[110vh] bg-white border border-[#F1F5F9] rounded-[2.5rem] overflow-hidden soft-shadow">
            <div className="shrink-0 px-8 py-6 border-b border-[#F1F5F9] flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400 text-lg">
                  forum
                </span>
                <h3 className="text-xs font-black uppercase tracking-widest">
                  Lobby chat
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#10B981] uppercase">
                  Live
                </span>
                <div className="size-1.5 bg-[#10B981] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </div>
            </div>

            <div
              ref={chatListRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-8 space-y-6"
            >
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-[#2563EB]" />
                </div>
              ) : lobbyMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No messages yet. Say hi to the lobby.
                </p>
              ) : (
                lobbyMessages.map((msg) => {
                  const time = new Date(msg.created_at);
                  const timeStr = time.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const displayName =
                    msg.sender_username || `User_${msg.sender_id.slice(0, 8)}`;
                  const isOwn = msg.sender_id === currentUserId;
                  const avatarUrl =
                    msg.sender_avatar_url ||
                    `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(msg.sender_id)}`;
                  return (
                    <div key={msg.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Image
                            src={avatarUrl}
                            alt=""
                            width={20}
                            height={20}
                            className="rounded-full shrink-0"
                            unoptimized
                          />
                          <span
                            className={
                              isOwn
                                ? "text-[10px] font-black text-[#2563EB] truncate"
                                : "text-[10px] font-black text-slate-500 truncate"
                            }
                          >
                            {displayName}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-300 shrink-0">
                          {timeStr}
                        </span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl rounded-tl-none border border-slate-100/50">
                        <p className="text-xs text-slate-600 leading-relaxed break-words">
                          {msg.body}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 p-6 bg-white border-t border-[#F1F5F9]">
              <div className="relative group">
                <input
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 pr-14 text-xs font-semibold focus:ring-2 focus:ring-[#2563EB]/10 transition-all outline-none placeholder:text-slate-300"
                  placeholder="Type a message..."
                  type="text"
                  value={chatInput}
                  maxLength={MAX_CHAT_BODY_LENGTH}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={!activeHunt || !currentUserId || sendingMessage}
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={
                    !chatInput.trim() ||
                    !activeHunt ||
                    !currentUserId ||
                    sendingMessage
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-9 flex items-center justify-center bg-white rounded-xl shadow-sm text-[#2563EB] hover:scale-105 transition-transform border border-slate-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {sendingMessage ? (
                    <div className="size-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-lg">
                      send
                    </span>
                  )}
                </button>
              </div>
              {chatInput.length > MAX_CHAT_BODY_LENGTH * 0.9 && (
                <p className="mt-1 text-[9px] text-slate-400 text-right">
                  {chatInput.length}/{MAX_CHAT_BODY_LENGTH}
                </p>
              )}
            </div>
          </div>

          <div className="px-6 py-4 flex items-center justify-between text-slate-300">
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 bg-[#10B981] rounded-full" />
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  12ms ping
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[10px]">
                  public
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  US-EAST-01
                </span>
              </div>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest">
              v0.1.0
            </span>
          </div>
        </div>
      </main>

      {/* Invite modal: share link and earn 500 coins when friend joins */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-wide text-[#0F172A]">
                Invite friends
              </h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Share your link. When a friend joins this hunt, you earn <strong className="text-[#10B981]">500 coins</strong> in your wallet.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                type="text"
                value={inviteLinkUrl}
                placeholder={inviteLinkLoading ? "Loading…" : ""}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 bg-slate-50"
              />
              <button
                type="button"
                disabled={!inviteLinkUrl || inviteLinkLoading}
                onClick={() => {
                  if (inviteLinkUrl) {
                    void navigator.clipboard.writeText(inviteLinkUrl);
                    setInviteModalOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold uppercase tracking-wide hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteRewardToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#10B981] text-white text-sm font-bold shadow-lg">
          {inviteRewardToast}
        </div>
      )}

        <AppFooter />
      </div>
    </AuthGuard>
  );
}

