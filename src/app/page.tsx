"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";

function formatCountdown(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);
  const [recentAvatars, setRecentAvatars] = useState<{ avatar_url: string | null }[]>([]);
  const [activeHuntStartDate, setActiveHuntStartDate] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    async function fetchRegisteredUsers() {
      try {
        const { data, count, error } = await supabase
          .from("player_profiles")
          .select("avatar_url", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(4);

        if (!error) {
          if (count !== null) setRegisteredCount(count);
          setRecentAvatars(data ?? []);
        }
      } catch {
        // ignore
      }
    }

    fetchRegisteredUsers();
  }, []);

  // Fetch active hunt for countdown
  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("hunts")
      .select("start_date")
      .eq("status", "active")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then((result: { data: { start_date: string } | null; error: unknown }) => {
        const { data, error } = result;
        if (error || !data) {
          setActiveHuntStartDate(null);
          setSecondsRemaining(null);
          return;
        }
        setActiveHuntStartDate(data.start_date);
        const start = new Date(data.start_date);
        const now = new Date();
        setSecondsRemaining(Math.max(0, Math.floor((start.getTime() - now.getTime()) / 1000)));
      });
  }, []);

  // Update countdown every second when we have an active hunt
  useEffect(() => {
    if (activeHuntStartDate === null) return;

    const t = setInterval(() => {
      const start = new Date(activeHuntStartDate);
      const now = new Date();
      setSecondsRemaining(Math.max(0, Math.floor((start.getTime() - now.getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [activeHuntStartDate]);

  const { minutes, seconds } = useMemo(() => {
    if (secondsRemaining === null) return { minutes: "—", seconds: "—" };
    return formatCountdown(secondsRemaining);
  }, [secondsRemaining]);

  const huntIsLive = secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-black text-[#0F172A]">
      {/* Map Background */}
      <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
      <div className="fixed inset-0 z-0 bg-white/50" aria-hidden="true" />
      <div className="fixed inset-0 z-0 grid-overlay pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {loading ? (
          <AppHeader
            variant="overlay"
            active="home"
            credits="0"
            tokens="0"
            rightSlot={
              <div className="flex items-center gap-3 sm:gap-4 opacity-70">
                <span className="text-sm font-bold px-4 py-2">Sign In</span>
                <span className="bg-[#0F172A] text-white text-sm font-extrabold px-5 py-3 rounded-full soft-shadow">
                  Create Hunter Profile
                </span>
              </div>
            }
          />
        ) : user ? (
          <AppHeaderWithAuth
            variant="overlay"
            active="home"
            tokensIcon="groups"
            onProfileClick={() => router.push("/profile")}
          />
        ) : (
          <AppHeader
            variant="overlay"
            active="home"
            credits="24,500"
            tokens="120"
            rightSlot={
              <div className="flex items-center gap-3 sm:gap-4">
                <Link
                  href="/auth/login"
                  className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="bg-[#0F172A] text-white text-sm font-extrabold px-5 py-3 rounded-full soft-shadow hover:bg-[#2563EB] transition-colors"
                >
                  Create Hunter Profile
                </Link>
              </div>
            }
          />
        )}

        <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-8 pt-16 lg:pt-20 grid grid-cols-12 gap-6 lg:gap-8">
          {/* Left: mission briefing + playstyle — hidden on mobile */}
          <div className="hidden lg:block col-span-12 lg:col-span-3 space-y-6 lg:pt-16">
            <section className="bg-white/90 border border-[#F1F5F9] rounded-[2.5rem] overflow-hidden soft-shadow">
              <div className="relative aspect-[16/10]">
                <Image
                  alt="Map preview"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBVqtNqE1S5s6z7jB-QFvbxsOkbQW3tFVFWSF2PnWngpOtAJXiA-JrtKbXmu9JO4hGodAdWAlWcVv6sh7A9MWLmi9j_zxb50pn2TupFjCf8B7c568CMgN3rLhbYwyo9pPEyQ22OWNVjPq0EitC2I7AAvl2WkmfKpQmmOJLMF5iXr3JODUbmcy6O9CsZzDK7oUYTkQRKjRCboBojxBxOKxK8GE6tplrrbXEJ08K9dOgbAiTc4BrIYVSK2kXdefA_ZSCghC0s2D3GB0r3"
                  fill
                  sizes="(max-width: 1024px) 100vw, 25vw"
                  className="object-cover"
                  priority
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className="px-3 py-1 bg-[#0F172A]/80 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-widest border border-white/10">
                    Live map objectives
                  </span>
                </div>
              </div>

              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-[#2563EB]">
                    radar
                  </span>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Mission briefing
                  </h2>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  Hunts are set by the platform. Your edge is how fast you solve,
                  how well you route, and how you manage travel constraints.
                </p>
              </div>
            </section>

            <section className="px-2">
              <p className="text-base sm:text-lg font-extrabold tracking-tight drop-shadow-[0_12px_40px_rgba(0,0,0,0.35)] whitespace-nowrap">
                <span className="text-white">Think</span>{" "}
                <span className="text-[#2563EB] text-sm">Travel</span>{" "}
                <span className="text-white">Win</span>
              </p>
            </section>
          </div>

          {/* Center: hero countdown + CTA */}
          <div className="col-span-12 lg:col-span-6 flex flex-col items-center justify-start py-4 lg:py-6 px-2 lg:px-8 mt-4 lg:mt-6">
            <div className="text-center space-y-6 w-full max-w-2xl">
              <h1 className="text-5xl sm:text-6xl lg:text-[80px] leading-[0.95] font-extrabold tracking-tight drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                <span className="text-white">Find</span>{" "}
                <span className="text-[#2563EB]">
                  Free <span className="italic">Gifts</span>
                </span>{" "}
                <span className="text-white">Everyday</span>
              </h1>

              <div className="bg-white/90 border border-[#F1F5F9] rounded-[2.5rem] p-10 soft-shadow">
                <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#2563EB]">
                  {activeHuntStartDate
                    ? huntIsLive
                      ? "Hunt is live"
                      : "Next hunt starts soon"
                    : "No active hunt"}
                </p>
                <div className="mt-6 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <span className="text-7xl sm:text-8xl font-black tracking-tighter tabular-nums">
                      {minutes}
                    </span>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
                      Minutes
                    </p>
                  </div>
                  <span className="text-5xl font-light text-slate-200 mt-[-2rem]">
                    :
                  </span>
                  <div className="text-center">
                    <span className="text-7xl sm:text-8xl font-black tracking-tighter tabular-nums text-[#2563EB]">
                      {seconds}
                    </span>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
                      Seconds
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href={huntIsLive ? "/hunts" : "/lobby"}
                    className="px-8 py-5 bg-[#0F172A] text-white rounded-full font-black text-sm uppercase tracking-[0.2em] transition-all hover:bg-[#2563EB] hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-[#0F172A]/10 text-center"
                  >
                    {huntIsLive ? "Enter Hunt" : "Enter Lobby"}
                  </Link>
                  <a
                    href="#hunts"
                    className="px-8 py-5 bg-white border border-[#F1F5F9] rounded-full font-black text-sm uppercase tracking-[0.2em] text-[#0F172A] hover:border-[#2563EB]/40 transition-colors text-center"
                  >
                    Browse Hunts
                  </a>
                </div>

                <h2 className="mt-6 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight drop-shadow-[0_12px_40px_rgba(0,0,0,0.35)] text-balance">
                  <span className="text-[#0F172A] text-xs sm:text-sm uppercase tracking-widest leading-snug">Loota is a live, map-based, skill-driven treasure hunt game</span>
                </h2>
              </div>
            </div>
          </div>

          {/* Right: live hunts — on tablet match center column width (max-w-2xl) so cards align with "Hunts starts soon" */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 lg:pt-16 w-full max-w-2xl lg:max-w-none mx-auto" id="hunts">
            <section className="bg-white/90 border border-[#F1F5F9] rounded-[2.5rem] px-5 py-6 soft-shadow overflow-hidden">
              <div className="flex items-center gap-3 mb-5">
                <span className="material-symbols-outlined text-slate-400">
                  directions
                </span>
                <h3 className="text-xs font-black uppercase tracking-widest">
                  Choose your travel mode
                </h3>
              </div>

              <div className="flex flex-nowrap items-center justify-between gap-1.5">
                {[
                  { label: "Walk", icon: "directions_walk" },
                  { label: "Bike", icon: "directions_bike" },
                  { label: "Motorbike", icon: "two_wheeler" },
                  { label: "Car", icon: "directions_car" },
                  { label: "Bus", icon: "directions_bus" },
                  { label: "Plane", icon: "flight_takeoff" },
                ].map((m) => (
                  <span
                    key={m.label}
                    className="loota-icon-wiggle inline-flex items-center justify-center size-10 rounded-full bg-[#0F172A] border border-white/10 text-white"
                    aria-label={m.label}
                    title={m.label}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {m.icon}
                    </span>
                  </span>
                ))}
              </div>
            </section>

            {/* Option B: Live Activity */}
            <div className="flex flex-col gap-6">
              <section className="bg-white/90 border border-[#F1F5F9] rounded-[2.5rem] px-6 py-5 soft-shadow overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-widest">
                      Active lootas
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">
                      {registeredCount !== null
                        ? registeredCount >= 100000
                          ? "100k+"
                          : registeredCount.toLocaleString()
                        : "—"}
                    </span>
                  </div>

                  <div className="flex -space-x-3 items-center">
                    {recentAvatars
                      .filter((p) => p.avatar_url)
                      .map((p, i) => (
                        <Image
                          key={i}
                          className="size-8 rounded-full border-2 border-white ring-1 ring-slate-100 object-cover"
                          alt="Scavenger avatar"
                          src={p.avatar_url!}
                          width={32}
                          height={32}
                          unoptimized
                        />
                      ))}
                    {registeredCount !== null && registeredCount > recentAvatars.length ? (
                      <div className="size-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black ring-1 ring-slate-100 min-w-[2rem]">
                        +{(registeredCount - recentAvatars.length).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              {/* Option C: Promo */}
              <section className="bg-[#0F172A] text-white rounded-[2.5rem] p-6 soft-shadow relative overflow-hidden border border-white/10">
                <div className="absolute -top-10 -right-10 size-48 rounded-full bg-[#2563EB]/25 blur-[60px]" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined text-[#2563EB]">
                      ios_share
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Invite a friend
                    </h3>
                  </div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    Share your link. When a friend joins the hunt from the lobby, you earn 500 coins.
                  </p>
                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="flex-1 px-5 py-3 rounded-full bg-white text-[#0F172A] font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-white/90 transition-colors"
                    >
                      Invite
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="px-5 py-3 rounded-full bg-white/10 border border-white/15 text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-white/15 transition-colors"
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              </section>
            </div>

          </div>
        </main>

        {/* Invite modal: share lobby link with ref so inviter earns 500 coins when friend joins */}
        {inviteModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setInviteModalOpen(false)}
          >
            <div
              className="bg-[#0F172A] text-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-wide">
                  Invite a friend
                </h3>
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/80"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              {user ? (
                <>
                  <p className="text-sm text-white/75">
                    When your friend opens this link and joins the hunt from the lobby, you earn <strong className="text-[#10B981]">500 coins</strong>.
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      type="text"
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/lobby?ref=${encodeURIComponent(user.id)}`
                          : ""
                      }
                      className="flex-1 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder:text-white/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url =
                          typeof window !== "undefined"
                            ? `${window.location.origin}/lobby?ref=${encodeURIComponent(user.id)}`
                            : "";
                        if (url) {
                          void navigator.clipboard.writeText(url);
                          setInviteModalOpen(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold uppercase tracking-wide hover:bg-[#1d4ed8] shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-white/75">
                    Sign in to get your personal invite link. When a friend joins the hunt from your link, you earn <strong className="text-[#10B981]">500 coins</strong>.
                  </p>
                  <Link
                    href="/auth/login"
                    className="block w-full py-3 rounded-xl bg-[#2563EB] text-white text-center font-bold text-sm hover:bg-[#1d4ed8] transition-colors"
                    onClick={() => setInviteModalOpen(false)}
                  >
                    Sign in to get your link
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="py-6 px-6 lg:px-12 border-t border-[#F1F5F9] bg-white/80 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-6 lg:gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>© {new Date().getFullYear()} LOOTA</span>
            <a className="hover:text-[#0F172A] transition-colors" href="#">
              Terms
            </a>
            <a className="hover:text-[#0F172A] transition-colors" href="#">
              Privacy
            </a>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
            <span className="material-symbols-outlined text-sm text-[#10B981]">verified_user</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Verified platform
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
