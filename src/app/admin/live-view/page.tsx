"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";
import { LiveViewContent } from "@/app/live-view/[huntId]/page";

type HuntRow = { id: string; title: string; status: string };

export default function AdminLiveViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const huntIdParam = searchParams.get("huntId") ?? "";

  const [hunts, setHunts] = useState<HuntRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      if (!supabase) {
        setHunts([{ id: "demo-1", title: "Demo Hunt (Skeleton)", status: "active" }]);
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

        const { data } = await supabase
          .from("hunts")
          .select("id, title, status")
          .in("status", ["active", "draft"])
          .order("created_at", { ascending: false });

        if (data) setHunts(data);
      } catch (error) {
        console.error("Auth/load error:", error);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  // When ?huntId= is set: embed live view on this page (same as broadcast – no redirect, same session)
  if (huntIdParam && !loading) {
    return (
      <div className="h-screen w-screen flex flex-col bg-[#0F172A]">
        <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-white/10 bg-[#0F172A]">
          {hunts.length > 0 && (
            <select
              value={huntIdParam}
              onChange={(e) => router.push(`/admin/live-view?huntId=${e.target.value}`)}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {hunts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          )}
          <Link
            href="/admin/live-view"
            className="text-sm text-white/70 hover:text-white hover:underline"
          >
            ← Back to list
          </Link>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <LiveViewContent
            huntId={huntIdParam}
            backHref="/admin/live-view"
            backLabel="← Back to list"
            embedded
            useAdminApi
          />
        </div>
      </div>
    );
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
              ← Dashboard
            </Link>
          }
        />

        <main className="flex-1 max-w-[900px] mx-auto w-full p-6 lg:p-8 pt-24 lg:pt-28">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-[#0F172A]">Live View</h1>
            <p className="mt-2 text-sm text-slate-600">
              Open a read-only map for a hunt. Same movement logic as the main hunt page, with modals for constraints and quiz.
            </p>
          </div>

          <div className="space-y-3">
            {hunts.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-4 bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-2xl soft-shadow"
              >
                <div>
                  <span className="font-bold text-[#0F172A]">{h.title}</span>
                  <span className="ml-2 text-xs text-slate-500 uppercase">{h.status}</span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/admin/live-view?huntId=${h.id}`)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#2563EB] transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">visibility</span>
                  Open live view
                </button>
              </div>
            ))}
          </div>

          {hunts.length === 0 && (
            <p className="text-slate-600 text-sm">No hunts to show. Create one from the dashboard.</p>
          )}
        </main>
      </div>
    </div>
  );
}
