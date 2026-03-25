"use client";

import { useState, useEffect } from "react";

type FaintPhase = { at: { lng: number; lat: number }; startedAt: number; ambulanceArrivalMs: number } | null;

type Props = {
  faintPhase: FaintPhase;
  isTravellingToHospital: boolean;
  hospitalStay: { startedAt: number; durationMs: number; costCoins: number; bikeRecoveryIncluded?: boolean } | null;
  credits: number;
  formatNaira: (n: number) => string;
  deductCredits: (amount: number, huntId?: string | null) => Promise<number | null>;
  openDrawer: (id: "coins") => void;
  setPayError: (v: string | null) => void;
  setHospitalStay: (v: null) => void;
  setDrawer: (v: null) => void;
  /** After successful pay: parent can set pendingDestination and open travel drawer so journey continues. */
  onAfterPayAndLeave?: () => void;
};

export function HuntsHospitalDrawerContent({
  faintPhase,
  isTravellingToHospital,
  hospitalStay,
  credits,
  formatNaira,
  deductCredits,
  openDrawer,
  setPayError,
  setHospitalStay,
  setDrawer,
  onAfterPayAndLeave,
}: Props) {
  const [tick, setTick] = useState(0);
  const [payingLoading, setPayingLoading] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  // Stage 1: You fainted. Ambulance is on the way (2 min).
  if (faintPhase) {
    const elapsed = now - faintPhase.startedAt;
    const remainingMs = Math.max(0, faintPhase.ambulanceArrivalMs - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
    const ss = String(remainingSec % 60).padStart(2, "0");
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Emergency</p>
          <p className="mt-2 text-sm font-extrabold text-[#0F172A]">You fainted</p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            We are taking you to a nearby hospital. The ambulance is on the way — you will be picked up shortly.
          </p>
        </div>
        <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Ambulance ETA</p>
          <p className="mt-2 text-sm font-extrabold tabular-nums text-[#0F172A]">{mm}:{ss}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F1F5F9]">
            <div
              className="h-full bg-[#DC2626]"
              style={{ width: `${Math.min(100, (100 * elapsed) / faintPhase.ambulanceArrivalMs)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Stage 2: En route to hospital
  if (isTravellingToHospital) {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Journey</p>
          <p className="mt-2 text-sm font-extrabold text-[#0F172A]">En route to hospital</p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            You fainted and we are taking you to a nearby hospital. The ambulance is on the way. You will need to rest there before you can continue.
          </p>
        </div>
      </div>
    );
  }

  // Stage 3 & 4: Recovering at hospital then Pay & leave (message matches countdown)
  if (!hospitalStay) return null;

  const elapsed = now - hospitalStay.startedAt;
  const remainingMs = Math.max(0, hospitalStay.durationMs - elapsed);
  const stayComplete = remainingMs <= 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const displayMinutes = Math.ceil(hospitalStay.durationMs / (60 * 1000));

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hospital</p>
        <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Recovering</p>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          You need to rest for {displayMinutes} minute{displayMinutes !== 1 ? "s" : ""} before you can be discharged and pay the bill.
        </p>
      </div>

      {!stayComplete ? (
        <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Time remaining</p>
          <p className="mt-2 text-sm font-extrabold tabular-nums text-[#0F172A]">{mm}:{ss}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F1F5F9]">
            <div
              className="h-full bg-[#2563EB]"
              style={{ width: `${Math.round(100 * (1 - remainingMs / hospitalStay.durationMs))}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Hospital bill</p>
          <p className="mt-2 text-sm font-extrabold tabular-nums text-[#0F172A]">
            {formatNaira(hospitalStay.costCoins)}
          </p>
          {hospitalStay.bikeRecoveryIncluded ? (
            <p className="mt-1 text-xs text-slate-500">Includes bicycle recovery & repair (left at scene)</p>
          ) : null}
          <button
            type="button"
            disabled={payingLoading}
            onClick={async () => {
              const cost = hospitalStay.costCoins;
              if (credits < cost) {
                setPayError("Not enough coins for hospital bill. Buy coins to continue.");
                openDrawer("coins");
                return;
              }
              setPayingLoading(true);
              try {
                const newBal = await deductCredits(cost);
                if (newBal === null) return;
                if (onAfterPayAndLeave) {
                  onAfterPayAndLeave();
                } else {
                  setHospitalStay(null);
                  setDrawer(null);
                }
              } finally {
                setPayingLoading(false);
              }
            }}
            className="mt-4 w-full px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] inline-flex items-center justify-center gap-2 bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {payingLoading ? (
              <>
                <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
                Paying…
              </>
            ) : (
              "Pay & leave hospital"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
