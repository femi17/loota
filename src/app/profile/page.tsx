"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile?.username != null) setUsername(profile.username);
  }, [profile?.username]);

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !username.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("player_profiles")
        .update({ username: username.trim() })
        .eq("user_id", user.id);

      if (error) throw error;
      await refreshProfile();
      setMessage({ type: "success", text: "Username updated." });
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message ?? "Failed to update username." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: "Failed to sign out." });
    } finally {
      setSigningOut(false);
    }
  }

  const avatarUrl =
    profile?.avatar_url ||
    (user?.id
      ? `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(user.id)}`
      : "");
  const email = user?.email ?? "—";
  const credits = profile?.credits != null
    ? Number(profile.credits).toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })
    : "0";
  const level = profile?.level ?? 1;

  return (
    <AuthGuard>
      <div className="min-h-screen relative overflow-x-hidden bg-white text-[#0F172A]">
        <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
        <div className="fixed inset-0 z-0 bg-white/50" aria-hidden="true" />
        <div className="relative z-10 min-h-screen flex flex-col">
          <AppHeaderWithAuth active="profile" />

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-2xl mx-auto w-full">
            {authLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#0F172A] border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-6 sm:p-8 rounded-3xl bg-white/90 backdrop-blur border border-[#F1F5F9] soft-shadow">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Profile
                  </p>
                  <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="size-24 rounded-full border-2 border-[#F1F5F9] overflow-hidden bg-slate-100 shrink-0">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt="Avatar"
                          width={96}
                          height={96}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-slate-400">
                            person
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <p className="text-lg font-extrabold text-[#0F172A] truncate">
                        {profile?.username ?? "Player"}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5 truncate">{email}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-2">
                        Level {level} Loota
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 rounded-3xl bg-white/90 backdrop-blur border border-[#F1F5F9] soft-shadow">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Username
                  </p>
                  <form onSubmit={handleSaveUsername} className="mt-4">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Display name"
                      className="w-full px-4 py-3 rounded-2xl border border-[#F1F5F9] text-sm font-semibold text-[#0F172A] outline-none focus:border-[#2563EB]/40 transition-colors"
                      maxLength={50}
                    />
                    <button
                      type="submit"
                      disabled={saving || !username.trim() || username.trim() === profile?.username}
                      className="mt-3 w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </form>
                  {message && (
                    <p
                      className={`mt-3 text-sm font-semibold ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {message.text}
                    </p>
                  )}
                </div>

                <div className="p-6 sm:p-8 rounded-3xl bg-white/90 backdrop-blur border border-[#F1F5F9] soft-shadow">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Wallet
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#F59E0B] text-2xl fill-1">
                      database
                    </span>
                    <p className="text-xl font-extrabold tabular-nums text-[#0F172A]">{credits}</p>
                    <span className="text-sm text-slate-500">credits</span>
                  </div>
                  <Link
                    href="/hunts"
                    className="mt-4 inline-block text-sm font-bold text-[#2563EB] hover:underline"
                  >
                    Use credits in Hunts →
                  </Link>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="w-full px-5 py-3 rounded-full border-2 border-slate-200 text-slate-600 font-extrabold text-xs uppercase tracking-[0.2em] hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
