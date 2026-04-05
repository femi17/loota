"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { getHuntDistrictsForState } from "@/lib/nigeria-hunt-districts";
import { HUNT_QUESTION_CATEGORIES } from "@/lib/hunt-quiz-categories";
import Link from "next/link";

type HuntConfig = {
  numberOfHunts: number;
  keysToWin: number;
  /** Set when Mapbox could not resolve any waypoints */
  geocodeError?: string;
  /** Non-fatal: e.g. swapped area when the planned LGA/LCDA could not be verified */
  geocodeWarnings?: string[];
  regionName?: string;
  startLocation?: { lng: number; lat: number };
  waypoints?: Array<{ label: string; lng: number; lat: number }>;
  pricing: {
    refuelCost: number;
    restCost: number;
    rejuvenateCost: number;
    maintenanceCost: {
      bicycle: number;
      motorbike: number;
      car: number;
    };
    rentCost: {
      bicycle: number;
      motorbike: number;
      car: number;
      bus: number;
    };
    busFare: number;
    planeFare: number;
  };
  questionCategories: string[];
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  briefing: string;
};

type Question = {
  question: string;
  answer: string;
  options?: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
};

export default function CreateHuntPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [paystackMode, setPaystackMode] = useState<"free" | "paid">("free");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    prize: "",
    prizePool: "",
    numberOfWinners: "",
    targetSpendPerUser: "",
    huntLocation: "Lagos",
    huntLga: getHuntDistrictsForState("Lagos")[0] ?? "",
    startDate: "",
    endDate: "",
    entryRequirement: "0",
    imageUrl: "",
  });

  const HUNT_LOCATION_OPTIONS = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa",
    "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger",
    "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
    "Abuja",
    "Nationwide",
  ];

  const [config, setConfig] = useState<HuntConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Admin-only: redirect to admin login if not authenticated or not admin
  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/admin");
          return;
        }
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!profile) {
          router.replace("/admin");
          return;
        }
      } catch (e) {
        console.error("Create hunt auth check:", e);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router]);

  async function handleGenerate() {
    if (
      !formData.prize ||
      !formData.prizePool ||
      !formData.numberOfWinners ||
      !formData.targetSpendPerUser ||
      !formData.startDate ||
      !formData.endDate
    ) {
      alert("Please fill in all required fields");
      return;
    }

    setGenerating(true);

    try {
      // Generate hunt configuration
      const configRes = await fetch("/api/admin/generate-hunt-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize: formData.prize,
          prizePool: parseFloat(formData.prizePool),
          numberOfWinners: parseInt(formData.numberOfWinners),
          targetSpendPerUser: parseFloat(formData.targetSpendPerUser),
          huntLocation: formData.huntLocation,
          huntLga: formData.huntLocation !== "Nationwide" && formData.huntLga ? formData.huntLga : undefined,
          startDate: formData.startDate,
          endDate: formData.endDate,
        }),
      });

      if (!configRes.ok) {
        const errBody = await configRes.json().catch(() => ({}));
        if (configRes.status === 401 || configRes.status === 403) {
          router.replace("/admin");
          return;
        }
        throw new Error((errBody as { error?: string }).error || "Failed to generate hunt configuration");
      }

      const huntConfig = (await configRes.json()) as HuntConfig & {
        geocodeError?: string;
        geocodeWarnings?: string[];
      };
      setConfig(huntConfig);
      if (huntConfig.geocodeError) {
        alert(huntConfig.geocodeError);
      } else if (!Array.isArray(huntConfig.waypoints) || huntConfig.waypoints.length === 0) {
        alert(
          "Generate completed but no waypoints were returned. Check Mapbox token on the server (MAPBOX_SECRET_TOKEN is best for API routes) and try again.",
        );
      } else if (huntConfig.geocodeWarnings?.length) {
        alert(
          `Hunt locations ready with ${huntConfig.waypoints.length} checkpoint(s).\n\nNotes:\n${huntConfig.geocodeWarnings.slice(0, 6).join("\n")}${huntConfig.geocodeWarnings.length > 6 ? "\n…" : ""}`,
        );
      }
      // Questions are NOT pre-generated: AI will generate a fresh question per player when they reach each location (see get-question API).
      setQuestions([]);
    } catch (error: any) {
      console.error("Error generating hunt:", error);
      alert(error.message || "Failed to generate hunt. Please check OpenAI API key.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) {
      alert("Please generate hunt configuration first");
      return;
    }
    if (!Array.isArray(config.waypoints) || config.waypoints.length === 0) {
      alert("Cannot save: no waypoints in this configuration. Generate again after fixing Mapbox / geocoding.");
      return;
    }

    setLoading(true);

    try {
      if (!supabase) {
        alert("Supabase is not configured yet. This is a skeleton view.");
        setLoading(false);
        return;
      }

      // Create hunt in database (dates as ISO for Supabase timestamp with time zone)
      // Questions are left empty: AI generates them when each player reaches a location (get-question API).
      const startDateIso = formData.startDate ? new Date(formData.startDate).toISOString() : null;
      const endDateIso = formData.endDate ? new Date(formData.endDate).toISOString() : null;
      if (!startDateIso || !endDateIso) {
        alert("Start and end date are required.");
        setLoading(false);
        return;
      }

      // Dedupe waypoints by (lat, lng) so we never save repeated locations
      const rawWaypoints = Array.isArray(config.waypoints) ? config.waypoints : [];
      const waypointKey = (w: { lat: number; lng: number }) => `${Number(w.lat.toFixed(5))},${Number(w.lng.toFixed(5))}`;
      const seen = new Set<string>();
      const waypoints = rawWaypoints.filter((w) => {
        const key = waypointKey(w);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const waypointCount = waypoints.length > 0 ? waypoints.length : 0;

      const { data: hunt, error } = await supabase
        .from("hunts")
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim(),
          prize: formData.prize.trim(),
          prize_pool: parseFloat(formData.prizePool),
          number_of_winners: parseInt(formData.numberOfWinners, 10),
          target_spend_per_user: parseFloat(formData.targetSpendPerUser),
          start_date: startDateIso,
          end_date: endDateIso,
          entry_requirement: parseInt(formData.entryRequirement, 10) || 0,
          image_url: formData.imageUrl?.trim() || null,
          number_of_hunts: waypointCount > 0 ? waypointCount : config.numberOfHunts,
          keys_to_win: waypointCount > 0 ? waypointCount : config.keysToWin,
          hunt_location: formData.huntLocation.trim() || null,
          region_name: config.regionName?.trim() || null,
          waypoints: waypointCount > 0 ? waypoints : null,
          pricing_config: { ...config.pricing, paystackMode },
          question_categories: config.questionCategories,
          difficulty_distribution: config.difficultyDistribution,
          briefing: config.briefing,
          questions: [], // AI generates questions when players reach each location
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        console.error("Hunt insert error:", error);
        throw new Error(error.message || "Failed to create hunt");
      }

      alert("Hunt created successfully! You can activate it from the hunts list.");
      router.push("/admin/hunts");
    } catch (error: any) {
      console.error("Error creating hunt:", error);
      alert(error.message || "Failed to create hunt");
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]" />
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

        <main className="flex-1 max-w-6xl mx-auto w-full p-6 lg:p-8 pt-24 lg:pt-28">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-[#0F172A]">Create New Hunt</h1>
            <p className="mt-2 text-sm text-slate-600">Fill in the details and let AI generate the configuration</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">info</span>
                Basic Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="The Central District"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                  placeholder="A thrilling treasure hunt across Nigeria (state or nationwide)..."
                />
              </div>
            </div>

            {/* Prize & Winners */}
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">emoji_events</span>
                Prize & Winners
              </h2>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Paystack mode
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPaystackMode("free")}
                    className={[
                      "px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-colors",
                      paystackMode === "free"
                        ? "bg-[#0F172A] text-white border-[#0F172A]"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    Free
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaystackMode("paid")}
                    className={[
                      "px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-colors",
                      paystackMode === "paid"
                        ? "bg-[#0F172A] text-white border-[#0F172A]"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    Paid
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Free uses <span className="font-mono">NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY</span> / <span className="font-mono">PAYSTACK_SECRET_KEY</span>. Paid uses{" "}
                  <span className="font-mono">PAID_PAYSTACK_PUBLIC_KEY</span> / <span className="font-mono">PAID_PAYSTACK_SECRET_KEY</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Prize *
                  </label>
                  <input
                    type="text"
                    value={formData.prize}
                    onChange={(e) => setFormData({ ...formData, prize: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="iPhone 17"
                  />
                  <p className="mt-2 text-xs text-slate-500">What players will win (e.g., iPhone 17, Car, etc.)</p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Prize pool – total (₦) *
                  </label>
                  <input
                    type="number"
                    value={formData.prizePool}
                    onChange={(e) => setFormData({ ...formData, prizePool: e.target.value })}
                    required
                    min="0"
                    step="1000"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="25000000"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Total amount to be shared among all winners. Per winner = pool ÷ number of winners.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Number of Winners *
                  </label>
                  <input
                    type="number"
                    value={formData.numberOfWinners}
                    onChange={(e) => setFormData({ ...formData, numberOfWinners: e.target.value })}
                    required
                    min="1"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Entry Requirement (Level)
                  </label>
                  <input
                    type="number"
                    value={formData.entryRequirement}
                    onChange={(e) => setFormData({ ...formData, entryRequirement: e.target.value })}
                    min="0"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    placeholder="5"
                  />
                </div>
              </div>
            </div>

            {/* Location & Economics */}
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">location_on</span>
                Location & Economics
              </h2>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Hunt location *
                </label>
                <select
                  value={formData.huntLocation}
                  onChange={(e) => {
                    const newState = e.target.value;
                    const districts = getHuntDistrictsForState(newState);
                    setFormData({
                      ...formData,
                      huntLocation: newState,
                      huntLga: districts.length > 0 ? districts[0]! : "",
                    });
                  }}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                >
                  {HUNT_LOCATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  One state = all quiz locations stay in that state; AI will set spend and number of locations. Nationwide = hunt can spread across states.
                </p>
                {formData.huntLocation &&
                  formData.huntLocation !== "Nationwide" &&
                  getHuntDistrictsForState(formData.huntLocation).length > 0 && (
                    <div className="mt-4">
                      <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                        LCDA (local council area)
                      </label>
                      <select
                        value={formData.huntLga}
                        onChange={(e) =>
                          setFormData({ ...formData, huntLga: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                      >
                        {getHuntDistrictsForState(formData.huntLocation).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        Same picker in every state: Lagos lists official LCDAs; other states use Nigeria’s standard LGA
                        names as the local council area for each waypoint.
                      </p>
                    </div>
                  )}
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Target Spend Per User (₦) *
                </label>
                <input
                  type="number"
                  value={formData.targetSpendPerUser}
                  onChange={(e) => setFormData({ ...formData, targetSpendPerUser: e.target.value })}
                  required
                  min="0"
                  step="100"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                  placeholder="100000"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Expected amount each player should spend. AI will calculate pricing and number of hunts based on this.
                </p>
              </div>
            </div>

            {/* Schedule */}
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">schedule</span>
                Schedule
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    Start Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    End Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* AI Generation */}
            <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">auto_awesome</span>
                AI Configuration
              </h2>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/90">
                <p className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">
                  Quiz categories (fixed)
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Each checkpoint uses one of these four types, in order, then repeats:{" "}
                  <span className="font-bold">{HUNT_QUESTION_CATEGORIES.join(" → ")}</span>.
                  “Guess the logo” and “Guess the flag” show an image in the app (Google favicon by domain + FlagCDN URLs in the AI question).
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className={[
                  "w-full px-6 py-4 rounded-xl font-extrabold text-sm uppercase tracking-[0.2em] transition-all",
                  generating
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-[#0F172A] text-white hover:bg-[#2563EB] hover:scale-[1.01] active:scale-[0.99]",
                ].join(" ")}
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin">sync</span>
                    Generating with AI...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Generate Hunt Configuration
                  </span>
                )}
              </button>

              {generating && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-sm text-blue-800">
                    AI is calculating pricing, determining number of locations, waypoint areas, and briefing…
                  </p>
                </div>
              )}
            </div>

            {/* Generated Configuration Preview */}
            {config && (
              <div className="bg-white/90 backdrop-blur-md border border-[#F1F5F9] rounded-3xl soft-shadow p-6 space-y-6">
                <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl">preview</span>
                  Generated Configuration
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#F1F5F9]">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
                      Number of Hunts
                    </p>
                    <p className="text-2xl font-extrabold text-[#0F172A]">
                      {config.waypoints?.length ?? config.numberOfHunts}
                    </p>
                  </div>
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#F1F5F9]">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
                      Keys to Win
                    </p>
                    <p className="text-2xl font-extrabold text-[#0F172A]">
                      {config.waypoints?.length ?? config.keysToWin}
                    </p>
                  </div>
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#F1F5F9]">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
                      Questions
                    </p>
                    <p className="text-lg font-extrabold text-[#0F172A]">AI at each location</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Generated when player arrives</p>
                  </div>
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#F1F5F9]">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
                      Categories
                    </p>
                    <p className="text-lg font-extrabold text-[#0F172A]">{config.questionCategories.length}</p>
                  </div>
                </div>

                {config.geocodeWarnings && config.geocodeWarnings.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-950 text-sm">
                    <p className="font-extrabold text-xs uppercase tracking-widest mb-2">Location notes</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {config.geocodeWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(config.waypoints) && config.waypoints.length > 0 && (
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                      Checkpoints (waypoints)
                    </p>
                    <ol className="list-decimal pl-5 space-y-2 text-sm text-[#0F172A]">
                      {config.waypoints.map((w, idx) => (
                        <li key={idx} className="pl-1">
                          <span className="font-bold">{w.label}</span>
                          <span className="text-slate-500 font-mono text-xs block sm:inline sm:ml-2">
                            {Number(w.lat).toFixed(5)}, {Number(w.lng).toFixed(5)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                      Question Categories
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {config.questionCategories.map((cat, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-[#2563EB]/10 text-[#2563EB] rounded-full text-xs font-bold"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                      Difficulty Distribution
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Easy</span>
                        <span className="text-sm font-extrabold text-[#0F172A]">{config.difficultyDistribution.easy}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Medium</span>
                        <span className="text-sm font-extrabold text-[#0F172A]">{config.difficultyDistribution.medium}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Hard</span>
                        <span className="text-sm font-extrabold text-[#0F172A]">{config.difficultyDistribution.hard}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                    Briefing
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed p-4 bg-[#F8FAFC] rounded-xl border border-[#F1F5F9]">
                    {config.briefing}
                  </p>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-800 mb-1">
                    Quiz brain
                  </p>
                  <p className="text-sm text-amber-900">
                    Questions are not pre-generated. When a player reaches each location, AI uses the category for that step (rotating the four types above) and generates a fresh question. Logo and flag rounds include an image line in the question text so players see the picture.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            {config && (
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-4 rounded-xl bg-[#10B981] text-white font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating Hunt..." : "Create Hunt"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfig(null);
                    setQuestions([]);
                  }}
                  className="px-6 py-4 rounded-xl bg-white border border-[#F1F5F9] text-[#0F172A] font-extrabold text-sm uppercase tracking-[0.2em] hover:bg-[#F8FAFC] transition-colors"
                >
                  Regenerate
                </button>
              </div>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
