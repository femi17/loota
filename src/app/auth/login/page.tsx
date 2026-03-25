"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe redirect: only allow same-origin paths (prevent open-redirect abuse)
  function getSafeRedirect(): string {
    const raw = searchParams.get("redirect");
    if (!raw) return "/lobby";
    // Must be a path: single leading slash, no protocol-relative (//), no backslash
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) {
      return raw;
    }
    return "/lobby";
  }

  // Check if user is already logged in
  useEffect(() => {
    supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
      const session = result.data.session;
      if (session) {
        const redirect = getSafeRedirect();
        window.location.href = redirect;
      }
    });
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Wait for session to be established and cookies to be set
      // Poll to ensure session is available
      let attempts = 0;
      let session = null;
      while (attempts < 20 && !session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
      }

      if (!session) {
        throw new Error("Session not established");
      }

      // Wait longer to ensure cookies are fully propagated to the browser
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Redirect to original destination or lobby (same-origin paths only)
      const redirect = getSafeRedirect();
      window.location.href = redirect;
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-white text-[#0F172A]">
      <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
      <div className="fixed inset-0 z-0 bg-white/50" aria-hidden="true" />
      <div className="fixed inset-0 z-0 grid-overlay pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <AppHeader
          variant="overlay"
          active="home"
          credits="0"
          tokens="0"
          rightSlot={
            <Link
              href="/"
              className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity"
            >
              Back to Home
            </Link>
          }
        />

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-extrabold text-[#0F172A]">Sign In</h1>
                <p className="mt-2 text-sm text-slate-600">Enter your credentials to continue</p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm font-extrabold text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="player@example.com"
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
                  disabled={loading}
                  className="w-full px-5 py-3 rounded-xl bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-[#F1F5F9] text-center">
                <p className="text-sm text-slate-600">
                  Don't have an account?{" "}
                  <Link
                    href="/auth/signup"
                    className="font-extrabold text-[#2563EB] hover:underline"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
