"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    username: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailVerification, setShowEmailVerification] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowEmailVerification(false);

    // Validation
    if (!formData.email || !formData.email.trim()) {
      setError("Email is required");
      setLoading(false);
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      // Trim and normalize email
      const normalizedEmail = formData.email.trim().toLowerCase();

      // Sign up with Supabase
      const appOrigin =
        (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const redirectUrl = appOrigin ? `${appOrigin.replace(/\/$/, "")}/auth/callback` : "";
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
        options: {
          data: {
            username: formData.username,
          },
          ...(redirectUrl && { emailRedirectTo: redirectUrl }),
        },
      });

      if (authError) {
        // Provide more helpful error messages
        if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
          setError("This email is already registered. Please sign in instead.");
        } else if (authError.message.includes("invalid")) {
          setError("Invalid email address. Please check your email and try again.");
        } else {
          setError(authError.message || "Failed to create account");
        }
        setLoading(false);
        return;
      }

      // Profile creation happens in two ways:
      // 1. Database trigger (automatic) - creates profile when user is inserted into auth.users
      // 2. API route (fallback) - if trigger didn't work or user has session
      if (data.user) {
        // If user has session (email confirmation disabled), create profile via API
        if (data.session) {
          try {
            const response = await fetch("/api/auth/create-profile", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                username: formData.username,
              }),
            });

            const result = await response.json();

            if (!response.ok) {
              console.error("Profile creation error");
              // Database trigger should have created it, so continue
            }
          } catch (err) {
            console.error("Could not create profile:", err);
            // Database trigger should have created it, so continue
          }

          // Redirect to lobby
          router.push("/lobby");
          router.refresh();
        } else {
          // Email confirmation required
          // Profile should be created by database trigger automatically
          // If trigger doesn't work, it will be created when they verify email
          setShowEmailVerification(true);
        }
      }
    } catch (err: any) {
      // This catch block should rarely be hit now since we handle errors above
      console.error("Unexpected signup error:", err);
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
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

        <main className="flex-1 flex items-center justify-center p-6 mt-20">
          <div className="w-full max-w-md">
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-extrabold text-[#0F172A]">Create Account</h1>
                <p className="mt-2 text-sm text-slate-600">Join the treasure hunt adventure</p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm font-extrabold text-red-700">{error}</p>
                </div>
              )}

              {showEmailVerification && (
                <div className="mb-6 p-6 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-600 text-2xl">
                      mail
                    </span>
                    <div className="flex-1">
                      <h3 className="text-sm font-extrabold text-blue-900 mb-2">
                        Check Your Email
                      </h3>
                      <p className="text-sm text-blue-700 leading-relaxed">
                        We've sent a verification email to <strong>{formData.email}</strong>. 
                        Please check your inbox and click the verification link to activate your account.
                      </p>
                      <p className="text-xs text-blue-600 mt-3">
                        Once verified, you can sign in and start your treasure hunt adventure!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!showEmailVerification && (
                <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                      placeholder="Hunter_Player"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                      placeholder="player@example.com"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500 -mt-2">Username is optional - will be generated if not provided</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500 -mt-2">Minimum 6 characters</p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-5 py-3 rounded-xl bg-[#0F172A] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </form>
              )}

              <div className="mt-6 pt-6 border-t border-[#F1F5F9] text-center">
                <p className="text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link
                    href="/auth/login"
                    className="font-extrabold text-[#2563EB] hover:underline"
                  >
                    Sign in
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
