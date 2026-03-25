"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";
type HuntListRow = { id: string; title: string; status: string; created_at: string };

/**
 * Admin-only launcher: the broadcast UI lives at `/broadcast/[huntId]` (same admin session as OBS browser source).
 * This page picks a hunt and opens that route; `?huntId=` redirects for old bookmarks.
 */
function AdminBroadcastLauncherInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hunts, setHunts] = useState<HuntListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  const huntIdParam = searchParams.get("huntId")?.trim() ?? "";

  useEffect(() => {
    if (!huntIdParam) return;
    router.replace(`/broadcast/${encodeURIComponent(huntIdParam)}`);
  }, [huntIdParam, router]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
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
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!profile) {
          router.push("/admin");
          return;
        }
        const { data, error } = await supabase
          .from("hunts")
          .select("id, title, status, created_at")
          .order("created_at", { ascending: false });
        if (!cancelled && !error && data) {
          setHunts(data as HuntListRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const activeHunts = hunts.filter((h) => h.status === "active");

  if (huntIdParam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] text-white">
        <div className="text-center">
          <div className="inline-block size-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="mt-4 text-sm font-bold">Opening broadcast…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]" />
          <p className="mt-4 text-sm text-slate-600">Loading hunts…</p>
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
            <Link href="/admin" className="text-sm font-bold px-4 py-2 hover:opacity-70">
              Admin home
            </Link>
          }
        />

        <main className="flex-1 max-w-lg mx-auto w-full p-6 pt-24">
          <h1 className="text-2xl font-extrabold">Broadcast</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            The live map and on-air quiz UI are at{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/broadcast/&lt;huntId&gt;</code>. Only accounts
            in <span className="font-semibold">admin_profiles</span> can open that URL — sign in once in OBS (or your
            browser) so the session cookie is present.
          </p>

          <div className="mt-8 p-5 rounded-2xl border border-[#F1F5F9] bg-white/90 backdrop-blur-md soft-shadow space-y-4">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-500">
              Active hunt
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#F1F5F9] text-sm font-semibold bg-white"
            >
              <option value="">Select hunt…</option>
              {activeHunts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
            {activeHunts.length === 0 ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                No active hunts. Activate one under{" "}
                <Link href="/admin/hunts" className="font-bold underline">
                  Manage hunts
                </Link>
                .
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href={selectedId ? `/broadcast/${selectedId}` : "#"}
                aria-disabled={!selectedId}
                className={`flex-1 text-center px-4 py-3 rounded-xl font-extrabold text-xs uppercase tracking-widest text-white transition-colors ${
                  selectedId ? "bg-[#0F172A] hover:bg-[#2563EB]" : "bg-slate-300 pointer-events-none"
                }`}
              >
                Open broadcast
              </Link>
              <Link
                href={selectedId ? `/broadcast/${selectedId}` : "#"}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!selectedId}
                className={`flex-1 text-center px-4 py-3 rounded-xl font-extrabold text-xs uppercase tracking-widest border-2 transition-colors ${
                  selectedId
                    ? "border-[#0F172A] text-[#0F172A] hover:bg-slate-50"
                    : "border-slate-200 text-slate-400 pointer-events-none"
                }`}
              >
                New tab (OBS)
              </Link>
            </div>
            {selectedId ? (
              <p className="text-[11px] text-slate-500 break-all">
                URL: {typeof window !== "undefined" ? window.location.origin : ""}/broadcast/{selectedId}
              </p>
            ) : null}
          </div>

          <p className="mt-6 text-xs text-slate-500">
            <Link href="/admin/hunts" className="font-bold text-[#2563EB] hover:underline">
              Manage hunts
            </Link>{" "}
            also has a Broadcast button per hunt.
          </p>
        </main>
      </div>
    </div>
  );
}

export default function AdminBroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]" />
        </div>
      }
    >
      <AdminBroadcastLauncherInner />
    </Suspense>
  );
}
