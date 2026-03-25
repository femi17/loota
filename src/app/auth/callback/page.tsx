"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

async function ensureProfileExists(userId: string) {
  try {
    const { data: existingProfile } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!existingProfile) {
      const response = await fetch("/api/auth/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("Failed to create profile:", result);
      }
    }
  } catch (err) {
    console.error("Error ensuring profile exists:", err);
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function handleCallback() {
      try {
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashError = hashParams.get("error");
          const errorDescription = hashParams.get("error_description");

          if (hashError) {
            setError(errorDescription || hashError);
            setLoading(false);
            setTimeout(() => router.push("/auth/login"), 3000);
            return;
          }

          if (accessToken && refreshToken) {
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              setError(sessionError.message);
              setLoading(false);
              setTimeout(() => router.push("/auth/login"), 3000);
              return;
            }

            if (data.user) {
              await ensureProfileExists(data.user.id);
              router.push("/lobby");
              return;
            }
          }
        }

        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");
        const nextRaw = searchParams.get("next") || "/lobby";
        const next =
          typeof nextRaw === "string" &&
          nextRaw.startsWith("/") &&
          !nextRaw.startsWith("//") &&
          !nextRaw.includes("\\")
            ? nextRaw
            : "/lobby";

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            setError(exchangeError.message);
            setLoading(false);
            setTimeout(() => router.push("/auth/login"), 3000);
            return;
          }

          if (data.user) {
            await ensureProfileExists(data.user.id);
            router.push(next);
            return;
          }
        }

        router.push("/auth/login");
      } catch (err: unknown) {
        console.error("Callback error:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
        setTimeout(() => router.push("/auth/login"), 3000);
      }
    }

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md p-6">
          <div className="mb-4">
            <span className="material-symbols-outlined text-red-500 text-5xl">error</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] mb-2">Authentication Error</h1>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <p className="text-xs text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A] mb-4"></div>
        <p className="text-sm text-slate-600">Completing authentication...</p>
      </div>
    </div>
  );
}
