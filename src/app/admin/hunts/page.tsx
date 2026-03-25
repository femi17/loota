"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";
import type { Hunt } from "@/lib/database.types";

export default function AdminHuntsPage() {
  const router = useRouter();
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [winnersByHunt, setWinnersByHunt] = useState<Record<string, Array<{
    player_id: string;
    won_at: string;
    keys_earned: number | null;
    keys_required: number | null;
    player_name?: string | null;
    player_email?: string | null;
  }>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // If Supabase not configured, show skeleton
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/admin");
          return;
        }

        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (!profile) {
          router.push("/admin");
          return;
        }

        // Load hunts
        const { data, error } = await supabase
          .from("hunts")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading hunts:", error);
        } else if (data) {
          setHunts(data);

          const huntIds = data.map((h) => h.id);
          if (huntIds.length > 0) {
            const { data: winnersData, error: winnersError } = await supabase
              .from("hunt_winners")
              .select("hunt_id, player_id, won_at, keys_earned, keys_required")
              .in("hunt_id", huntIds)
              .order("won_at", { ascending: true });

            if (!winnersError && winnersData) {
              const playerIds = Array.from(new Set(winnersData.map((w: any) => String(w.player_id))));
              let namesByPlayerId: Record<string, { name?: string | null; email?: string | null }> = {};
              // Prefer the in-hunt display name snapshot (player_positions.player_name) so admin sees the actual Loota username used in that hunt.
              const namesByHuntAndPlayer: Record<string, string> = {};
              if (playerIds.length > 0) {
                const { data: positionNames } = await supabase
                  .from("player_positions")
                  .select("hunt_id, player_id, player_name")
                  .in("hunt_id", huntIds)
                  .in("player_id", playerIds);
                if (positionNames) {
                  for (const row of positionNames as any[]) {
                    const hid = String(row.hunt_id ?? "");
                    const pid = String(row.player_id ?? "");
                    const name = typeof row.player_name === "string" ? row.player_name.trim() : "";
                    if (!hid || !pid || !name) continue;
                    namesByHuntAndPlayer[`${hid}:${pid}`] = name;
                  }
                }
              }
              if (playerIds.length > 0) {
                const { data: profiles } = await supabase
                  .from("player_profiles")
                  .select("user_id, username, email")
                  .in("user_id", playerIds);
                if (profiles) {
                  namesByPlayerId = profiles.reduce((acc: Record<string, { name?: string | null; email?: string | null }>, p: any) => {
                    acc[String(p.user_id)] = {
                      name: typeof p.username === "string" ? p.username : null,
                      email: typeof p.email === "string" ? p.email : null,
                    };
                    return acc;
                  }, {});
                }
              }

              const grouped = winnersData.reduce((acc: Record<string, Array<{
                player_id: string;
                won_at: string;
                keys_earned: number | null;
                keys_required: number | null;
                player_name?: string | null;
                player_email?: string | null;
              }>>, w: any) => {
                const hid = String(w.hunt_id);
                const pid = String(w.player_id);
                if (!acc[hid]) acc[hid] = [];
                acc[hid].push({
                  player_id: pid,
                  won_at: String(w.won_at ?? ""),
                  keys_earned: Number.isFinite(w.keys_earned) ? Number(w.keys_earned) : null,
                  keys_required: Number.isFinite(w.keys_required) ? Number(w.keys_required) : null,
                  player_name: namesByHuntAndPlayer[`${hid}:${pid}`] ?? namesByPlayerId[pid]?.name ?? null,
                  player_email: namesByPlayerId[pid]?.email ?? null,
                });
                return acc;
              }, {});
              setWinnersByHunt(grouped);
            }
          }
        }
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  async function updateHuntStatus(huntId: string, status: string) {
    if (!supabase) {
      alert("Supabase is not configured yet. This is a skeleton view.");
      return;
    }

    const { error } = await supabase
      .from("hunts")
      .update({ status })
      .eq("id", huntId);

    if (error) {
      alert("Failed to update hunt status");
    } else {
      setHunts((prev) => prev.map((h) => (h.id === huntId ? { ...h, status: status as any } : h)));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]"></div>
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-white text-[#0F172A]">
      <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
      <div className="fixed inset-0 z-[2] grid-overlay pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <AppHeader
          variant="page"
          active="home"
          credits="0"
          tokens="0"
          rightSlot={
            <Link
              href="/admin"
              className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity"
            >
              Back to Dashboard
            </Link>
          }
        />

        <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-8 pt-24 lg:pt-28">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0F172A]">Manage Hunts</h1>
              <p className="mt-2 text-sm text-slate-600">View and manage all treasure hunts</p>
            </div>
            <Link
              href="/admin/hunts/create"
              className="px-5 py-3 rounded-xl bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
            >
              Create Hunt
            </Link>
          </div>

          <div className="space-y-4">
            {hunts.length === 0 ? (
              <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-12 text-center">
                <p className="text-slate-600">No hunts created yet</p>
                <Link
                  href="/admin/hunts/create"
                  className="mt-4 inline-block px-5 py-3 rounded-xl bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
                >
                  Create Your First Hunt
                </Link>
              </div>
            ) : (
              hunts.map((hunt) => (
                <div
                  key={hunt.id}
                  className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-extrabold text-[#0F172A]">{hunt.title}</h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                            hunt.status === "active"
                              ? "bg-green-100 text-green-700"
                              : hunt.status === "draft"
                                ? "bg-slate-100 text-slate-700"
                                : hunt.status === "completed"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-red-100 text-red-700"
                          }`}
                        >
                          {hunt.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{hunt.description}</p>
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                            Prize Pool
                          </p>
                          <p className="mt-1 text-lg font-extrabold text-[#0F172A]">
                            ₦{hunt.prize_pool.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                            Winners
                          </p>
                          <p className="mt-1 text-lg font-extrabold text-[#0F172A]">
                            {hunt.number_of_winners}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                            Target Spend
                          </p>
                          <p className="mt-1 text-lg font-extrabold text-[#0F172A]">
                            ₦{hunt.target_spend_per_user.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                            Per Winner
                          </p>
                          <p className="mt-1 text-lg font-extrabold text-[#0F172A]">
                            ₦{Math.round(hunt.prize_pool / hunt.number_of_winners).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Winners Recorded
                        </p>
                        {winnersByHunt[hunt.id]?.length ? (
                          <div className="mt-2 space-y-2">
                            {winnersByHunt[hunt.id]!.slice(0, 5).map((w) => (
                              <p key={`${w.player_id}-${w.won_at}`} className="text-xs text-slate-700">
                                <span className="font-black text-[#0F172A] mr-1">
                                  #{(winnersByHunt[hunt.id]?.findIndex((x) => x.player_id === w.player_id && x.won_at === w.won_at) ?? 0) + 1}
                                </span>
                                <span className="font-bold">{w.player_name || w.player_email || w.player_id.slice(0, 8)}</span>
                                {" — "}
                                {w.keys_earned ?? "?"}/{w.keys_required ?? "?"} keys
                                {" — "}
                                {w.won_at ? new Date(w.won_at).toLocaleString() : "time unknown"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">No winners recorded yet.</p>
                        )}
                      </div>
                    </div>
                    <div className="ml-6 flex flex-col gap-2">
                      {hunt.status === "draft" && (
                        <button
                          onClick={() => updateHuntStatus(hunt.id, "active")}
                          className="px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-extrabold uppercase tracking-widest hover:bg-green-700 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      {hunt.status === "active" && (
                        <button
                          onClick={() => updateHuntStatus(hunt.id, "completed")}
                          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold uppercase tracking-widest hover:bg-blue-700 transition-colors"
                        >
                          Complete
                        </button>
                      )}
                      <Link
                        href={`/broadcast/${hunt.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-extrabold uppercase tracking-widest hover:bg-[#2563EB] transition-colors text-center"
                      >
                        Broadcast
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
