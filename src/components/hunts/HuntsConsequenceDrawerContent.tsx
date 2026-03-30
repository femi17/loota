"use client";

import type { ConsequenceFlow } from "@/app/hunts/types";

type Props = {
  consequenceFlow: ConsequenceFlow | null;
  credits: number;
  /** Cost to refuel after running out (coins). */
  outOfFuelCostCoins: number;
  deductCredits: (amount: number, huntId?: string | null) => Promise<number | null>;
  openDrawer: (id: "coins") => void;
  setPayError: (v: string | null) => void;
  onGoToHospital: () => void;
  onWalkToGasStation: () => void;
  onWalkToBikeShop: () => void;
};

export function HuntsConsequenceDrawerContent({
  consequenceFlow,
  credits,
  outOfFuelCostCoins,
  deductCredits,
  openDrawer,
  setPayError,
  onGoToHospital,
  onWalkToGasStation,
  onWalkToBikeShop,
}: Props) {
  if (!consequenceFlow) return null;

  const isFaint = consequenceFlow.kind === "faint";
  const isOutOfFuel = consequenceFlow.kind === "out_of_fuel";
  const isBikeRepair = consequenceFlow.kind === "bike_repair";

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">What happened</p>
        {isFaint && (
          <>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">You fainted</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              You pushed too hard without resting. An ambulance is on the way. You&apos;ll be taken to the nearest hospital to recover.
            </p>
            <button
              type="button"
              onClick={onGoToHospital}
              className="mt-4 w-full px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors"
            >
              Go to hospital
            </button>
          </>
        )}
        {isOutOfFuel && (
          <>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">You ran out of fuel</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Your vehicle is stranded. Walk to the nearest gas station to get fuel, then walk back to your vehicle.
            </p>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Refuel fee</p>
              <p className="mt-1 text-sm font-extrabold tabular-nums text-amber-900">
                {outOfFuelCostCoins.toLocaleString()} coins
              </p>
              <p className="mt-1 text-xs text-amber-800/90">
                Pay to refuel, then you&apos;ll walk to the nearest station and return to your vehicle.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const cost = Math.max(0, outOfFuelCostCoins);
                if (cost > 0 && credits < cost) {
                  setPayError("Not enough coins to refuel. Buy coins to continue.");
                  openDrawer("coins");
                  return;
                }
                if (cost > 0) {
                  const newBal = await deductCredits(cost);
                  if (newBal === null) return;
                }
                onWalkToGasStation();
              }}
              className="mt-4 w-full px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors"
            >
              Pay & walk to gas station
            </button>
          </>
        )}
        {isBikeRepair && (
          <>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Your tire went flat</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              You kept going without resting. Walk to the nearest bike shop or repair spot to get it fixed.
            </p>
            <button
              type="button"
              onClick={onWalkToBikeShop}
              className="mt-4 w-full px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors"
            >
              Walk to bike shop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
