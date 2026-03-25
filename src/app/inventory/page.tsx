"use client";

import { AppFooter } from "@/components/AppFooter";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import {
  getFareDisplay,
  getPickupSeconds,
  getRentFrom,
  type TravelModeId,
} from "@/lib/travel-config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Coin cost for vehicles (buy from wallet). */
const COIN_COST: Partial<Record<TravelModeId, number>> = {
  bicycle: 2_500,
  motorbike: 9_000,
  car: 22_000,
};
const BUYABLE_IDS: TravelModeId[] = ["bicycle", "motorbike", "car"];

type MaintenanceRule = {
  intervalKm?: number;
  intervalMinutes?: number;
  cost: number;
  durationSeconds: number;
  notes: string;
};

type TravelMode = {
  id: TravelModeId;
  name: string;
  tag: string;
  icon: string;
  topSpeedKmh: number;
  // Travel simulation knobs (placeholders for the future engine)
  rentalPickupSeconds?: number;
  buyPrice?: number;
  rentPrice?: number;
  fuelCostPerUnit?: number; // $ per L or equivalent unit
  fuelCapacityUnits?: number; // L, or "energy units"
  consumptionPer100km?: number; // L/100km
  farePerRide?: number; // bus-only
  maintenance: MaintenanceRule;
};


function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

function rangeKm(mode: TravelMode) {
  if (
    !mode.fuelCapacityUnits ||
    !mode.consumptionPer100km ||
    mode.consumptionPer100km <= 0
  )
    return null;
  return Math.round((mode.fuelCapacityUnits / mode.consumptionPer100km) * 100);
}

/** Range display for cards/specs. Bicycle fixed lower than car/motorbike; walk/bus/plane fixed; others from fuel. */
function rangeDisplay(mode: TravelMode): string {
  if (mode.id === "walk") return "10 km";
  if (mode.id === "bicycle") return "30 km";
  if (mode.id === "bus_pass") return "100 km";
  if (mode.id === "air_taxi") return "2,000+ km";
  const r = rangeKm(mode);
  return r != null ? `${r} km` : "—";
}

/** Label for running cost: Board (bus), Ticket (plane), Running (others). */
function runningLabel(mode: TravelMode): string {
  if (mode.id === "bus_pass") return "Board";
  if (mode.id === "air_taxi") return "Ticket";
  return "Running";
}

/** Running/Board/Ticket value for specs panel. */
function runningValueDisplay(mode: TravelMode): string {
  if (mode.id === "walk") return "Free";
  const v = getRentFrom(mode.id) ?? getFareDisplay(mode.id);
  return v != null ? `~ ${v.toLocaleString()}` : "—";
}


/** Base travel mode specs (no prices – those come from travel-config). */
const MODES: TravelMode[] = [
  {
    id: "walk",
    name: "Walk",
    tag: "Always available",
    icon: "directions_walk",
    topSpeedKmh: 5,
    maintenance: {
      intervalMinutes: 25,
      cost: 0,
      durationSeconds: 90,
      notes: "Fatigue builds over time. Rest to maintain peak pace.",
    },
  },
  {
    id: "bicycle",
    name: "Bicycle",
    tag: "Fast + efficient",
    icon: "directions_bike",
    topSpeedKmh: 18,
    fuelCostPerUnit: 0,
    fuelCapacityUnits: 100,
    consumptionPer100km: 10,
    maintenance: {
      intervalKm: 30,
      cost: 180,
      durationSeconds: 90,
      notes: "Service after long rides. Minor repairs keep speed stable.",
    },
  },
  {
    id: "motorbike",
    name: "Motorbike",
    tag: "Fast + agile",
    icon: "two_wheeler",
    topSpeedKmh: 55,
    fuelCostPerUnit: 3,
    fuelCapacityUnits: 12,
    consumptionPer100km: 3.8,
    maintenance: {
      intervalKm: 120,
      cost: 260,
      durationSeconds: 180,
      notes: "Oil + chain upkeep. Skip service and risk a slowdown event.",
    },
  },
  {
    id: "car",
    name: "Car",
    tag: "Best for long routes",
    icon: "directions_car",
    topSpeedKmh: 80,
    fuelCostPerUnit: 4,
    fuelCapacityUnits: 45,
    consumptionPer100km: 7.5,
    maintenance: {
      intervalKm: 250,
      cost: 320,
      durationSeconds: 240,
      notes: "Tires + engine checks. Higher cost, fewer fatigue events.",
    },
  },
  {
    id: "bus_pass",
    name: "Bus",
    tag: "Predictable timing",
    icon: "directions_bus",
    topSpeedKmh: 35,
    maintenance: {
      intervalMinutes: 9999,
      cost: 0,
      durationSeconds: 0,
      notes: "No maintenance. Pay per ride; walk to bus stop + wait.",
    },
  },
  {
    id: "air_taxi",
    name: "Plane",
    tag: "Premium fast travel",
    icon: "flight_takeoff",
    topSpeedKmh: 180,
    maintenance: {
      intervalMinutes: 9999,
      cost: 0,
      durationSeconds: 0,
      notes: "Long trips only. Go to airport first (choose transfer mode).",
    },
  },
];

type InventoryRow = {
  item_type: string;
  item_id: string;
  owned: boolean;
};

export default function InventoryPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [selectedId, setSelectedId] = useState<TravelModeId>("walk");
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<TravelModeId | null>(null);
  const [defaultModeLoading, setDefaultModeLoading] = useState<TravelModeId | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const purchaseKeyRef = useRef<{ itemId: TravelModeId; key: string; at: number } | null>(null);

  const credits = Number(profile?.credits ?? 0);

  const owned = useMemo(() => {
    const set = new Set<TravelModeId>(["walk"]);
    inventoryRows
      .filter((r) => r.item_type === "travel_mode" && r.item_id)
      .forEach((r) => set.add(r.item_id as TravelModeId));
    return set;
  }, [inventoryRows]);

  /** Profile stores hunts-style ids (bus, plane). Map to inventory id for "is default" highlight. */
  const profileDefaultId = (profile as any)?.default_travel_mode as string | undefined;
  const defaultInventoryId = useMemo(() => {
    if (profileDefaultId === "bus") return "bus_pass";
    if (profileDefaultId === "plane") return "air_taxi";
    if (profileDefaultId && MODES.some((m) => m.id === profileDefaultId)) return profileDefaultId;
    return "walk";
  }, [profileDefaultId]);

  async function setDefaultTravelMode(modeId: TravelModeId) {
    setDefaultModeLoading(modeId);
    setInventoryError(null);
    try {
      const res = await fetch("/api/profile/default-travel-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInventoryError(data?.error ?? "Could not set default.");
        return;
      }
      await refreshProfile?.();
    } finally {
      setDefaultModeLoading(null);
    }
  }

  const selected = useMemo(
    () => MODES.find((m) => m.id === selectedId) ?? MODES[0],
    [selectedId],
  );

  const selectedRange = useMemo(() => rangeKm(selected), [selected]);

  const fetchInventory = useCallback(async () => {
    if (!user?.id || !supabase) return;
    setInventoryError(null);
    setInventoryLoading(true);
    const { data, error } = await supabase
      .from("player_inventory")
      .select("item_type, item_id, owned")
      .eq("player_id", user.id)
      .eq("item_type", "travel_mode");

    if (error) {
      setInventoryError("Could not load inventory.");
      setInventoryRows([]);
    } else {
      setInventoryRows((data as InventoryRow[]) ?? []);
    }
    setInventoryLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setInventoryLoading(false);
      setInventoryRows([]);
      return;
    }
    fetchInventory();
  }, [user?.id, fetchInventory]);

  async function purchaseWithWallet(itemId: TravelModeId) {
    if (!BUYABLE_IDS.includes(itemId) || owned.has(itemId)) return;
    const cost = COIN_COST[itemId];
    if (cost == null || credits < cost) return;
    setPurchasingId(itemId);
    setInventoryError(null);
    const KEY_WINDOW_MS = 10_000;
    const prev = purchaseKeyRef.current;
    const idempotencyKey =
      prev?.itemId === itemId && Date.now() - prev.at < KEY_WINDOW_MS
        ? prev.key
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    if (!prev || prev.itemId !== itemId || Date.now() - prev.at >= KEY_WINDOW_MS) {
      purchaseKeyRef.current = { itemId, key: idempotencyKey, at: Date.now() };
    }
    try {
      const res = await fetch("/api/inventory/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, idempotency_key: idempotencyKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInventoryError(data?.error ?? "Purchase failed.");
        return;
      }
      await refreshProfile?.();
      await fetchInventory();
    } finally {
      setPurchasingId(null);
    }
  }

  const coinPackages = useMemo(
    () => [
      { coins: 2000, amountNgn: 1000 },
      { coins: 5000, amountNgn: 2500 },
      { coins: 10000, amountNgn: 5000 },
    ],
    [],
  );

  async function ensurePaystackLoaded() {
    if (typeof window === "undefined") return false;
    if ((window as any).PaystackPop) return true;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[src="https://js.paystack.co/v1/inline.js"]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Paystack failed to load")));
        return;
      }
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Paystack failed to load"));
      document.body.appendChild(s);
    });
    return Boolean((window as any).PaystackPop);
  }

  async function startPaystackPayment(pkg: { coins: number; amountNgn: number }) {
    setPayError(null);
    setPaystackLoading(true);
    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) {
      setPayError("Paystack is not configured.");
      setPaystackLoading(false);
      return;
    }
    if (!user?.id) {
      setPayError("You must be signed in to add coins.");
      setPaystackLoading(false);
      return;
    }
    const ref = `loota-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const ok = await ensurePaystackLoaded();
      if (!ok) throw new Error("Paystack did not load");
      const PaystackPop = (window as any).PaystackPop;
      PaystackPop.setup({
        key,
        ref,
        email: user.email ?? "player@loota.game",
        amount: pkg.amountNgn * 100,
        currency: "NGN",
        metadata: {
          custom_fields: [
            { display_name: "Coins", variable_name: "coins", value: pkg.coins },
            { display_name: "User", variable_name: "user_id", value: user.id },
          ],
        },
        callback: function () {
          (async function () {
            try {
              const res = await fetch("/api/wallet/add-coins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reference: ref }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok) {
                await refreshProfile?.();
              } else {
                setPayError(data?.error ?? "Wallet could not be updated.");
              }
            } catch {
              setPayError("Failed to update wallet.");
            } finally {
              setPaystackLoading(false);
            }
          })();
        },
        onClose: function () {
          setPaystackLoading(false);
        },
      }).openIframe();
    } catch (e: any) {
      setPayError(e?.message ?? "Paystack failed");
      setPaystackLoading(false);
    }
  }

  function formatNaira(n: number) {
    return `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }

  function scrollCarousel(direction: "left" | "right") {
    const el = carouselRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.round(el.clientWidth * 0.8));
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-white text-[#0F172A] antialiased">
        <AppHeaderWithAuth active="inventory" />

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-8 grid grid-cols-12 gap-6 lg:gap-8">
        {/* Left: default travel mode + viewing specs */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <section className="bg-white border border-[#F1F5F9] rounded-[2.5rem] p-8 soft-shadow">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-400">
                tune
              </span>
              <h2 className="text-xs font-black uppercase tracking-widest">
                Default travel mode
              </h2>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Pick your default for the travel modal in hunts.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
              {MODES.map((m) => {
                const isDefault = defaultInventoryId === m.id;
                const loading = defaultModeLoading === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    onClick={() => setDefaultTravelMode(m.id)}
                    disabled={!!defaultModeLoading}
                    className={[
                      "flex shrink-0 items-center justify-center p-2.5 rounded-2xl border transition-colors",
                      isDefault
                        ? "bg-[#0F172A] text-white border-[#0F172A]"
                        : "bg-[#F8FAFC] text-[#0F172A] border-[#F1F5F9] hover:border-slate-300 disabled:opacity-60",
                    ].join(" ")}
                  >
                    <span className="material-symbols-outlined text-lg">{m.icon}</span>
                    {loading && (
                      <span className="ml-1 inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-[#0F172A] text-white rounded-[2.5rem] p-8 soft-shadow relative overflow-hidden border border-white/10">
            <div className="absolute -top-10 -right-10 size-48 rounded-full bg-[#2563EB]/25 blur-[60px]" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#2563EB]">
                  build
                </span>
                <h3 className="text-xs font-black uppercase tracking-widest">
                  Maintenance
                </h3>
              </div>
              <p className="text-sm text-white/75 leading-relaxed">
                Maintaining your travel mode keeps speed stable and reduces “breakdown”
                stop-actions. Skip service and risk a slowdown.
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[#10B981]">
                In-hunt: low fuel and maintenance warnings
              </p>
            </div>
          </section>

        </div>

        {/* Center: shop */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Inventory
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Your travel modes and specs. Cost is always set by the hunt pool—rent or buy in-hunt.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalletModalOpen(true)}
              className="shrink-0 px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
              Load wallet
            </button>
          </div>

          {inventoryError && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">error</span>
              {inventoryError}
            </div>
          )}

          <div className="relative">
            <div
              ref={carouselRef}
              className="loota-scrollbar-hidden flex gap-4 overflow-x-auto -mx-2 px-2 snap-x snap-mandatory"
            >
            {inventoryLoading ? (
              <div className="min-w-[280px] flex items-center justify-center p-8 text-slate-400">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-[#2563EB]" />
              </div>
            ) : (
            MODES.map((m) => {
              const isOwned = owned.has(m.id);
              const pickupSecs = getPickupSeconds(m.id);
              const runningFrom = getRentFrom(m.id) ?? getFareDisplay(m.id);
              const isFree = m.id === "walk";

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(m.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === m.id}
                  className={[
                    "min-w-[280px] sm:min-w-[320px] snap-start text-left bg-white border rounded-[2rem] p-6 soft-shadow transition-all",
                    "hover:shadow-2xl hover:-translate-y-0.5",
                    selectedId === m.id
                      ? "border-[#2563EB]/50"
                      : "border-[#F1F5F9]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-extrabold tracking-tight">
                          {m.name}
                        </p>
                        {isFree ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] text-[10px] font-black uppercase tracking-widest">
                            Free
                          </span>
                        ) : null}
                        {isOwned ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] text-[10px] font-black uppercase tracking-widest">
                            Owned
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{m.tag}</p>
                    </div>
                    <div className="size-12 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">{m.icon}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Speed
                      </p>
                      <p className="text-sm font-black">{m.topSpeedKmh} km/h</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Range
                      </p>
                      <p className="text-sm font-black">{rangeDisplay(m)}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        {runningLabel(m)}
                      </p>
                      <p className="text-sm font-black">
                        {isFree ? "Free" : runningFrom != null ? `~ ${runningFrom.toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Maintenance
                      </p>
                      <p className="text-sm font-black">
                        {m.maintenance.cost > 0
                          ? `~ ${m.maintenance.cost.toLocaleString()}`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-slate-500">
                      {pickupSecs > 0
                        ? `Pickup: ${formatDuration(pickupSecs)}`
                        : "No pickup delay"}
                    </div>
                    {isFree ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">
                        Included
                      </span>
                    ) : BUYABLE_IDS.includes(m.id) && !isOwned ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500">
                          {COIN_COST[m.id]?.toLocaleString()} coins
                        </span>
                        <button
                          type="button"
                          disabled={credits < (COIN_COST[m.id] ?? 0) || purchasingId === m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            purchaseWithWallet(m.id);
                          }}
                          className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-[#0F172A] text-white hover:bg-[#2563EB] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {purchasingId === m.id ? "…" : "Buy"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </div>
                </div>
              );
            })
            )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => scrollCarousel("left")}
                className="size-10 rounded-full bg-white border border-[#F1F5F9] text-[#0F172A] hover:border-[#2563EB]/40 transition-colors soft-shadow flex items-center justify-center"
                aria-label="Scroll left"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel("right")}
                className="size-10 rounded-full bg-white border border-[#F1F5F9] text-[#0F172A] hover:border-[#2563EB]/40 transition-colors soft-shadow flex items-center justify-center"
                aria-label="Scroll right"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: selected details */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <section className="rounded-[2.5rem] p-8 soft-shadow relative overflow-hidden bg-[#0F172A] text-white border border-white/10">
            <div className="absolute -top-10 -right-10 size-56 rounded-full bg-[#2563EB]/35 blur-[70px]" />
            <div className="absolute -bottom-16 -left-16 size-72 rounded-full bg-[#2563EB]/20 blur-[90px]" />
            <div className="absolute inset-0 opacity-60 bg-gradient-to-br from-[#0F172A] via-[#0B1D4A] to-[#0F172A]" />
            <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white/60">
                  info
                </span>
                <h2 className="text-xs font-black uppercase tracking-widest text-white/80">
                  Specs
                </h2>
              </div>
              <div className="size-10 rounded-2xl bg-white/10 text-white flex items-center justify-center">
                <span className="material-symbols-outlined">{selected.icon}</span>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-2xl font-black tracking-tight">{selected.name}</p>
              <p className="mt-2 text-sm text-white/70">{selected.tag}</p>
            </div>

            <div className="mt-6 space-y-3 text-sm text-white/80">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Top speed</span>
                <span className="font-extrabold text-white">{selected.topSpeedKmh} km/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Range</span>
                <span className="font-extrabold text-white">{rangeDisplay(selected)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">{runningLabel(selected)}</span>
                <span className="font-extrabold text-white">{runningValueDisplay(selected)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Fuel capacity</span>
                <span className="font-extrabold text-white">
                  {selected.fuelCapacityUnits ? `${selected.fuelCapacityUnits} L` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Consumption</span>
                <span className="font-extrabold text-white">
                  {selected.consumptionPer100km
                    ? `${selected.consumptionPer100km} L/100km`
                    : selected.id === "bus_pass" || selected.id === "air_taxi"
                      ? "Per ride (pool)"
                      : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Maintenance</span>
                <span className="font-extrabold text-white">
                  {selected.maintenance.cost > 0
                    ? `~ ${selected.maintenance.cost.toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Service interval</span>
                <span className="font-extrabold text-white">
                  {selected.maintenance.intervalKm
                    ? `Every ${selected.maintenance.intervalKm} km`
                    : selected.maintenance.intervalMinutes
                      ? `Every ${selected.maintenance.intervalMinutes} min`
                      : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Service time</span>
                <span className="font-extrabold text-white">
                  {selected.maintenance.durationSeconds > 0
                    ? formatDuration(selected.maintenance.durationSeconds)
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-white p-5 border border-white/15">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                When to maintain
              </p>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {selected.maintenance.notes}
              </p>
            </div>
            </div>
          </section>
        </div>
      </main>

      {/* Load your wallet modal — Paystack to add coins */}
      {walletModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setWalletModalOpen(false)}
        >
          <div
            className="bg-white rounded-[2rem] shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black uppercase tracking-widest text-[#0F172A]">
                Load your wallet
              </h3>
              <button
                type="button"
                onClick={() => setWalletModalOpen(false)}
                className="size-10 rounded-full border border-[#F1F5F9] text-slate-500 hover:bg-slate-50 flex items-center justify-center"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Add coins to your wallet with Paystack. Then use your wallet to buy vehicles and pay for travel in hunts.
            </p>
            {payError && (
              <p className="mb-4 text-sm text-red-600">{payError}</p>
            )}
            <div className="space-y-3">
              {coinPackages.map((p) => (
                <div
                  key={p.coins}
                  className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9] flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-extrabold">{p.coins.toLocaleString()} coins</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Pay {formatNaira(p.amountNgn)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={paystackLoading}
                    onClick={() => startPaystackPayment(p)}
                    className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-[#0F172A] text-white hover:bg-[#2563EB] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors min-w-[100px]"
                  >
                    {paystackLoading ? "Loading…" : "Paystack"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

        <AppFooter />
      </div>
    </AuthGuard>
  );
}

