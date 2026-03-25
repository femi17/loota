"use client";

import Link from "next/link";
import type { TravelModeId } from "@/app/hunts/types";
import { getPickupSeconds } from "@/lib/travel-config";

export type InventoryCatalogItem = {
  id: TravelModeId;
  label: string;
  icon: string;
  buyCost: number;
  canOwn: boolean;
};

export type ModeSpec = {
  id: TravelModeId;
  label: string;
  icon: string;
  speedKmh: number;
};

type Props = {
  shopError: string | null;
  openDrawer: (id: "coins") => void;
  inventoryCatalog: readonly InventoryCatalogItem[];
  ownedModes: Set<TravelModeId>;
  credits: number;
  formatNaira: (n: number) => string;
  buyInventoryItem: (item: { id: TravelModeId; buyCost: number; canOwn: boolean }) => void;
  /** When set, that vehicle's Buy button is in progress (wallet purchase API). */
  inventoryPurchasingId?: TravelModeId | null;
  travelModeId: TravelModeId;
  setTravelModeId: (id: TravelModeId) => void;
  modeSpecs: readonly ModeSpec[];
  /** When true, player is going to a constraint/stop location; disable mode selection to prevent cheating. */
  hasActiveStopFlow?: boolean;
};

function formatPickup(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function HuntsInventoryDrawerContent({
  shopError,
  openDrawer,
  inventoryCatalog,
  ownedModes,
  credits,
  formatNaira,
  buyInventoryItem,
  inventoryPurchasingId = null,
  travelModeId,
  setTravelModeId,
  modeSpecs,
  hasActiveStopFlow = false,
}: Props) {
  const specMap = new Map(modeSpecs.map((s) => [s.id, s]));

  const loadoutOrder: TravelModeId[] = ["walk", "bicycle", "motorbike", "car"];
  const loadoutModes = loadoutOrder.filter((id) => id === "walk" || ownedModes.has(id));
  const selectedSpec = specMap.get(travelModeId);

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Your loadout</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Travel modes you own. Tap one to set as selected and view specs.
        </p>
        {hasActiveStopFlow ? (
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Going to stop — travel mode locked
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {loadoutModes.map((id) => {
            const spec = specMap.get(id);
            const selected = travelModeId === id;
            if (!spec) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTravelModeId(id)}
                disabled={hasActiveStopFlow}
                className={[
                  "flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-colors",
                  hasActiveStopFlow ? "opacity-45 cursor-not-allowed" : "",
                  selected
                    ? "bg-[#0F172A] text-white border-[#0F172A]"
                    : "bg-[#F8FAFC] text-[#0F172A] border-[#F1F5F9] hover:border-slate-300",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-lg">{spec.icon}</span>
                <span className="text-sm font-bold">{spec.label}</span>
              </button>
            );
          })}
        </div>
        {selectedSpec ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Specs — {selectedSpec.label}
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Top speed</span>
                <span className="font-extrabold text-[#0F172A]">{selectedSpec.speedKmh} km/h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Pickup delay</span>
                <span className="font-extrabold text-[#0F172A]">
                  {getPickupSeconds(selectedSpec.id) > 0
                    ? formatPickup(getPickupSeconds(selectedSpec.id))
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Inventory</p>
        <p className="mt-2 text-sm text-slate-600">
          Buy vehicles with your wallet (coins). Load wallet on the inventory page or Buy coins below.
        </p>
        {shopError ? <p className="mt-3 text-sm text-red-600">{shopError}</p> : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => openDrawer("coins")}
            className="flex-1 px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
          >
            Buy coins
          </button>
          <Link
            href="/inventory"
            className="px-5 py-3 rounded-full bg-white border border-[#F1F5F9] text-[#0F172A] font-extrabold text-xs uppercase tracking-[0.2em] hover:border-[#2563EB]/40 transition-colors"
          >
            Full inventory
          </Link>
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Shop</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {inventoryCatalog.map((item) => {
            const owned = ownedModes.has(item.id);
            const purchasing = inventoryPurchasingId === item.id;
            const canBuyWithCredits =
              !owned && credits >= item.buyCost && !inventoryPurchasingId;

            return (
              <div
                key={item.id}
                className="relative flex flex-col p-4 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9] min-h-[120px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 rounded-2xl bg-white border border-[#F1F5F9] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#0F172A] text-2xl">
                      {item.icon}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold truncate">
                      {item.label}
                      {owned ? (
                        <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-[#10B981]">
                          Owned
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {formatNaira(item.buyCost)} coins
                    </p>
                  </div>
                </div>
                {item.canOwn && (
                  <div className="mt-auto pt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        buyInventoryItem({
                          id: item.id,
                          buyCost: item.buyCost,
                          canOwn: item.canOwn,
                        })
                      }
                      disabled={owned || !canBuyWithCredits || purchasing}
                      className={[
                        "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] transition-colors whitespace-nowrap",
                        owned || (!canBuyWithCredits && !purchasing)
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
                      ].join(" ")}
                    >
                      {purchasing ? "Buying…" : "Buy"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
