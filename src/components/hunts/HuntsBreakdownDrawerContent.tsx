"use client";

import type { SetStateAction } from "react";
import type { VehicleId, VehicleState } from "@/app/hunts/types";
import { TOW_COST } from "@/app/hunts/constants";

type Props = {
  breakdownFlow: { modeId: VehicleId } | null;
  credits: number;
  formatNaira: (n: number) => string;
  deductCredits: (amount: number, huntId?: string | null) => Promise<number | null>;
  openDrawer: (id: "coins") => void;
  setPayError: (v: string | null) => void;
  setVehicleState: (v: SetStateAction<Record<VehicleId, VehicleState>>) => void;
  setBreakdownFlow: (v: null) => void;
  setToast: (v: { title: string; message: string } | null) => void;
  setDrawer: (v: "travel" | null) => void;
};

const REPAIR_WORLD_SECONDS = 60 * 60;
const MAINT_SPEEDUP = 1;

export function HuntsBreakdownDrawerContent({
  breakdownFlow,
  credits,
  formatNaira,
  deductCredits,
  openDrawer,
  setPayError,
  setVehicleState,
  setBreakdownFlow,
  setToast,
  setDrawer,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vehicle breakdown</p>
        <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Tow required</p>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Your owned vehicle broke down on the road. A tow truck will take it to the garage. You can continue the
          journey with another travel mode, but you can't use this vehicle until it's repaired.
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Tow cost</p>
          <p className="text-sm font-extrabold tabular-nums">
            {breakdownFlow ? formatNaira(TOW_COST[breakdownFlow.modeId]) : "—"}
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Repair time: <span className="font-bold">1h</span> (in-game)
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <button
          type="button"
          onClick={async () => {
            if (!breakdownFlow) return;
            const id = breakdownFlow.modeId;
            const cost = TOW_COST[id] ?? 0;
            if (credits < cost) {
              setPayError("Not enough coins for tow. Buy coins to continue.");
              openDrawer("coins");
              return;
            }
            const newBal = await deductCredits(cost);
            if (newBal === null) return;
            const now = Date.now();
            const realMs = Math.max(10_000, Math.round((REPAIR_WORLD_SECONDS * 1000) / MAINT_SPEEDUP));
            setVehicleState((prev) => ({
              ...prev,
              [id]: { ...prev[id], status: "repairing", untilMs: now + realMs, healthPct: 0 },
            }));
            setBreakdownFlow(null);
            setToast({
              title: "Repair started",
              message: "Vehicle sent for repair. Use another mode while it's fixed.",
            });
            setDrawer("travel");
          }}
          className="w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
        >
          Pay tow & send for repair
        </button>
        <button
          type="button"
          onClick={() => setDrawer("travel")}
          className="mt-3 w-full px-5 py-3 rounded-full bg-white border border-[#F1F5F9] text-[#0F172A] font-extrabold text-xs uppercase tracking-[0.2em] hover:border-[#2563EB]/40 transition-colors"
        >
          Continue with another mode
        </button>
      </div>
    </div>
  );
}
