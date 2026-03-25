"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      // Check if Supabase is configured
      if (!supabase) {
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Check if user is admin
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (profile) {
          setUser(user);
        } else {
          // Not an admin, redirect
          router.push("/");
        }
      }
    } catch (error) {
      console.error("Error checking user:", error);
      // If Supabase not configured, allow access for skeleton
      if (error instanceof Error && error.message.includes("supabaseUrl")) {
        // Supabase not configured yet - allow skeleton access
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSigningIn(true);

    try {
      if (!supabase) {
        alert("Supabase is not configured yet. Please set up your environment variables.");
        setIsSigningIn(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if admin
      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .single();

      if (profile) {
        setUser(data.user);
        router.refresh();
      } else {
        await supabase.auth.signOut();
        alert("Access denied. Admin access only.");
      }
    } catch (error: any) {
      alert(error.message || "Failed to sign in");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
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

  // For skeleton/demo: if Supabase not configured, show dashboard directly
  const showDashboard = !supabase || user;

  if (!showDashboard) {
    return (
      <div className="min-h-screen relative overflow-x-hidden bg-white text-[#0F172A]">
        <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
        <div className="fixed inset-0 z-[2] grid-overlay pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center size-16 bg-[#0F172A] rounded-2xl text-white mb-4">
                  <span className="material-symbols-outlined text-3xl">admin_panel_settings</span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#0F172A]">Admin Portal</h1>
                <p className="mt-2 text-sm text-slate-600">Sign in to manage hunts</p>
              </div>

              {!supabase && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> Supabase is not configured yet. This is a skeleton view.
                    Configure your environment variables to enable authentication.
                  </p>
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                    placeholder="admin@loota.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSigningIn || !supabase}
                  className="w-full px-5 py-3 rounded-xl bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningIn ? "Signing in..." : "Sign In"}
                </button>
              </form>
            </div>
          </div>
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
            <div className="flex items-center gap-3">
              <button
                onClick={handleSignOut}
                className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity"
              >
                Sign Out
              </button>
            </div>
          }
        />

        <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-8 pt-24 lg:pt-28">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-[#0F172A]">Admin Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">Manage hunts and monitor players</p>
            {!supabase && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Skeleton Mode:</strong> Supabase is not configured. This is a preview of the admin interface.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Link
              href="/admin/hunts/create"
              className="p-6 bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow hover:shadow-xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 flex items-center justify-center bg-[#0F172A] rounded-2xl text-white group-hover:bg-[#2563EB] transition-colors">
                  <span className="material-symbols-outlined text-2xl">add_circle</span>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#0F172A]">Create Hunt</h3>
                  <p className="text-sm text-slate-600 mt-1">Set up a new treasure hunt</p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/hunts"
              className="p-6 bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow hover:shadow-xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 flex items-center justify-center bg-[#0F172A] rounded-2xl text-white group-hover:bg-[#2563EB] transition-colors">
                  <span className="material-symbols-outlined text-2xl">list</span>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#0F172A]">Manage Hunts</h3>
                  <p className="text-sm text-slate-600 mt-1">View and edit existing hunts</p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/broadcast"
              className="p-6 bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow hover:shadow-xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 flex items-center justify-center bg-[#0F172A] rounded-2xl text-white group-hover:bg-[#2563EB] transition-colors">
                  <span className="material-symbols-outlined text-2xl">videocam</span>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#0F172A]">Broadcast</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Admin-only TV view at <span className="font-mono text-xs">/broadcast/…</span> (sign in for OBS)
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/live-view"
              className="p-6 bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow hover:shadow-xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 flex items-center justify-center bg-[#0F172A] rounded-2xl text-white group-hover:bg-[#2563EB] transition-colors">
                  <span className="material-symbols-outlined text-2xl">visibility</span>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#0F172A]">Live View</h3>
                  <p className="text-sm text-slate-600 mt-1">Read-only map and player modals</p>
                </div>
              </div>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
