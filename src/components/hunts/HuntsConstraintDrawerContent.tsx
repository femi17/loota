"use client";

import { useState, useEffect } from "react";
import type { LngLat, StopFlow, TravelModeId, TravelPause } from "@/app/hunts/types";
import { STOP_SPEEDUP, STOP_SPEEDUP_REST_IN_PLACE, REJUVENATE_KM_BONUS_AFTER_VENUE } from "@/app/hunts/constants";
import { clamp } from "@/app/hunts/utils";

function getConstraintMessage(stopFlow: StopFlow | null): string {
  if (!stopFlow) return "Relax at a nearby place.";
  if (stopFlow.kind === "refuel") return "You've been driving for too long. You need to refuel.";
  if (stopFlow.kind === "rest") return "You've been on the road for too long. You need to take a break.";
  // Rejuvenate: reason depends on travel mode
  if (stopFlow.kind === "rejuvenate" && stopFlow.modeId === "walk") return "You have been walking for too long. You need to rest and rejuvenate.";
  if (stopFlow.kind === "rejuvenate" && stopFlow.modeId === "bicycle") return "You have been cycling for too long. You need to rest and rejuvenate.";
  return "You have been on the move for too long. You need to relax.";
}

function getKeepGoingWarning(stopFlow: StopFlow | null): string {
  if (!stopFlow) return "Something could go wrong if you continue.";
  if (stopFlow.kind === "refuel") return "Your vehicle could run out of fuel and leave you stranded.";
  if (stopFlow.kind === "rest") return "You could become too tired to drive safely.";
  if (stopFlow.kind === "rejuvenate" && (stopFlow.modeId === "walk" || stopFlow.modeId === "bicycle")) return "You could faint or injure yourself from exhaustion.";
  return "Continuing could be risky.";
}

type Props = {
  stopFlow: StopFlow | null;
  travelPause: TravelPause | null;
  credits: number;
  playerPos: LngLat | null;
  formatNaira: (n: number) => string;
  deductCredits: (amount: number, huntId?: string | null) => Promise<number | null>;
  openDrawer: (id: "coins") => void;
  closeDrawer: () => void;
  setStopFlow: (v: StopFlow | null | ((prev: StopFlow | null) => StopFlow | null)) => void;
  setDrawer: (v: null) => void;
  setPayError: (v: string | null) => void;
  startTravelWithRoute: (
    from: LngLat,
    to: LngLat,
    coords: Array<[number, number]>,
    modeId: TravelModeId,
    etaSeconds?: number,
    finalDestination?: LngLat,
    rejuvenateBonusKm?: number
  ) => void;
  /** Called when user taps "Go to this stop" (rejuvenate/refuel/rest); page starts the route. */
  onGoToStop?: () => void;
  /** Called when user taps "I'll keep going" or "Continue anyway". If triggerConsequence, page will trigger consequence (faint/out of fuel/etc.) after a short distance. */
  onCancelStop?: (opts?: { triggerConsequence?: boolean }) => void;
  /** Called before resuming travel to final destination (Pay & continue / Continue) so arrival shows quiz, not stop again. */
  onResumeToDestination?: () => void;
  /** When true, user has already tapped "Go to this stop" and is en route — hide the action buttons so they can't trigger again. */
  isTravelingToStop?: boolean;
};

export function HuntsConstraintDrawerContent({
  stopFlow,
  travelPause,
  credits,
  playerPos,
  formatNaira,
  deductCredits,
  openDrawer,
  closeDrawer,
  setStopFlow,
  setDrawer,
  setPayError,
  startTravelWithRoute,
  onGoToStop,
  onCancelStop,
  onResumeToDestination,
  isTravelingToStop = false,
}: Props) {
  const [showKeepGoingWarning, setShowKeepGoingWarning] = useState(false);
  const [payContinueLoading, setPayContinueLoading] = useState(false);

  useEffect(() => {
    if (stopFlow?.status !== "to_stop") setShowKeepGoingWarning(false);
  }, [stopFlow?.status]);
  useEffect(() => {
    if (stopFlow?.status !== "ready_to_pay" && stopFlow?.status !== "relaxing") setPayContinueLoading(false);
  }, [stopFlow?.status]);

  return (
    <div className="space-y-4">
      {travelPause?.kind === "bus_stop" ? (
        <>
          <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop</p>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Bus stop</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Passengers are alighting and boarding. You'll continue automatically.
            </p>
          </div>
          <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
            <BusStopTimer startedAt={travelPause.startedAt} totalMs={travelPause.totalMs} />
          </div>
        </>
      ) : (
        <>
          <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Constraint</p>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
              {stopFlow?.restInPlace
                ? "Rest here (free)"
                : stopFlow?.kind === "refuel"
                  ? "Refuel stop"
                  : stopFlow?.kind === "rest"
                    ? "Relax at venue"
                    : stopFlow?.kind === "rejuvenate"
                      ? "Relax at venue"
                      : "Stop"}
            </p>
            {stopFlow?.isSecondWarning ? (
              <div className="mt-2 p-3 rounded-2xl bg-red-50 border border-red-200">
                <p className="text-sm font-extrabold text-red-700">You have reached your limit.</p>
                <p className="mt-1 text-xs text-red-600">Rest now or you may faint.</p>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {getConstraintMessage(stopFlow)}
              {stopFlow?.status === "finding"
                ? " Looking for a nearby place…"
                : stopFlow?.stop?.place_name && !stopFlow?.restInPlace
                  ? ` ${stopFlow.kind === "refuel" ? "Refuel at" : "Relax at"} ${stopFlow.stop.place_name}.`
                  : ""}
            </p>
            {stopFlow?.stop &&
            !stopFlow.restInPlace &&
            (stopFlow.distanceMetersToStop != null || stopFlow.durationSecondsToStop != null) ? (
              <p className="mt-2 text-sm font-medium text-[#0F172A]">
                {[
                  Number.isFinite(stopFlow.distanceMetersToStop) && (stopFlow.distanceMetersToStop ?? 0) >= 0
                    ? `${((stopFlow.distanceMetersToStop ?? 0) / 1000).toFixed(1)} km`
                    : null,
                  Number.isFinite(stopFlow.durationSecondsToStop) && (stopFlow.durationSecondsToStop ?? 0) >= 0
                    ? `~${Math.max(1, Math.round((stopFlow.durationSecondsToStop ?? 0) / 60))} min`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
                {" • "}
                <span className="text-slate-500 font-normal">Route on map</span>
              </p>
            ) : null}
            {stopFlow?.error ? (
              <div className="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-100">
                <p className="text-sm font-extrabold text-amber-700">{stopFlow.error}</p>
              </div>
            ) : null}
          </div>

          {stopFlow?.status === "relaxing" || stopFlow?.status === "ready_to_pay" ? (
            <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
              <RelaxingTimer stopFlow={stopFlow} clamp={clamp} />
              {stopFlow.restInPlace ? (
                <p className="mt-2 text-xs font-medium text-slate-500">Free — no payment</p>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Cost</p>
                  <p className="text-sm font-extrabold tabular-nums">{formatNaira(stopFlow.costCoins ?? 0)}</p>
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!stopFlow) return;
                  if (stopFlow.status !== "ready_to_pay") return;
                  const cost = stopFlow.costCoins ?? 0;
                  if (cost > 0 && credits < cost) {
                    setPayError("Not enough coins. Buy coins to continue.");
                    openDrawer("coins");
                    return;
                  }
                  setPayContinueLoading(true);
                  try {
                    if (cost > 0) {
                      const newBal = await deductCredits(cost);
                      if (newBal === null) {
                        setPayContinueLoading(false);
                        return;
                      }
                    }
                    const from = playerPos;
                    if (!from || !stopFlow.resumeCoords?.length || stopFlow.resumeEtaSeconds == null) {
                      setStopFlow(null);
                      closeDrawer();
                      return;
                    }
                    onResumeToDestination?.(); // so arrival at destination shows quiz, not stop again
                    const to = stopFlow.finalTo;
                    const modeId = stopFlow.modeId;
                    const coords = stopFlow.resumeCoords;
                    const eta = stopFlow.resumeEtaSeconds;
                    const bonusKm =
                      !stopFlow.restInPlace &&
                      (stopFlow.kind === "rejuvenate" || stopFlow.kind === "rest")
                        ? REJUVENATE_KM_BONUS_AFTER_VENUE
                        : undefined;
                    setStopFlow(null);
                    setDrawer(null);
                    startTravelWithRoute(from, to, coords, modeId, eta, undefined, bonusKm);
                  } finally {
                    setPayContinueLoading(false);
                  }
                }}
                className={[
                  "mt-4 w-full px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2",
                  stopFlow?.status === "ready_to_pay" && !payContinueLoading
                    ? "bg-[#0F172A] text-white hover:bg-[#2563EB]"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed",
                ].join(" ")}
                disabled={
                  payContinueLoading ||
                  stopFlow?.status !== "ready_to_pay" ||
                  (Boolean(stopFlow?.restInPlace) && !stopFlow?.resumeCoords?.length)
                }
              >
                {payContinueLoading ? (
                  <>
                    <span className="inline-block size-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" aria-hidden />
                    {stopFlow?.costCoins && stopFlow.costCoins > 0 ? "Paying…" : "Continuing…"}
                  </>
                ) : stopFlow?.restInPlace ? (
                  "Continue"
                ) : (
                  "Pay & continue"
                )}
              </button>
            </div>
          ) : stopFlow?.status === "to_stop" &&
            stopFlow?.stop &&
            (stopFlow?.coordsToStop?.length > 0 || stopFlow?.restInPlace) ? (
            <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
              {showKeepGoingWarning ? (
                <>
                  <p className="text-sm font-extrabold text-amber-700 mb-2">Warning</p>
                  <p className="text-sm text-slate-600 mb-4">{getKeepGoingWarning(stopFlow)}</p>
                  <p className="text-sm text-slate-500 mb-4">Are you sure you want to continue anyway?</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowKeepGoingWarning(false);
                        onCancelStop?.({ triggerConsequence: true });
                      }}
                      className="flex-1 px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Continue anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKeepGoingWarning(false)}
                      className="flex-1 px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      Go back
                    </button>
                  </div>
                </>
              ) : isTravelingToStop ? (
                <div className="p-4 rounded-2xl bg-[#0F172A]/5 border border-[#0F172A]/10">
                  <p className="text-sm font-extrabold text-[#0F172A]">
                    On the way to {stopFlow.stop?.place_name ?? "stop"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Follow the route on the map. The buttons will return when you arrive.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    {stopFlow.restInPlace
                      ? "No café, eatery or bar within 2.5 miles ahead on your route. Rest here for 5 minutes (free). When you find one nearby, relaxing there is faster and gives you +2 km before the next rest prompt."
                      : `Go to this stop to ${stopFlow.kind === "refuel" ? "refuel" : stopFlow.kind === "rest" ? "relax" : "rejuvenate"}.`}
                  </p>
                  {!stopFlow.restInPlace && (stopFlow.kind === "rejuvenate" || stopFlow.kind === "rest") ? (
                    <p className="text-xs text-slate-500 mb-4">
                      Relaxing at a venue is faster (2 min) and gives you +2 km before the next rest prompt.
                    </p>
                  ) : null}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => onGoToStop?.()}
                      className="flex-1 px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors"
                    >
                      {stopFlow.restInPlace ? "Rest here (5 min)" : "Go to this stop"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKeepGoingWarning(true)}
                      className="flex-1 px-5 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      I'll keep going
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : stopFlow?.status === "finding" ? (
            <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9] flex items-center gap-3">
              <span
                className="inline-block size-6 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#2563EB]"
                aria-hidden
              />
              <p className="text-sm text-slate-600">Finding a nearby place. This can take a few seconds.</p>
            </div>
          ) : (
            <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
              <p className="text-sm text-slate-600">Follow the reroute on the map.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BusStopTimer({ startedAt, totalMs }: { startedAt: number; totalMs: number }) {
  const total = Math.max(1000, totalMs);
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const p = clamp(elapsedMs / total, 0, 1);
  const remainingSec = Math.max(0, Math.ceil((total - elapsedMs) / 1000));
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  return (
    <>
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Boarding / alighting</p>
      <p className="mt-2 text-sm font-extrabold tabular-nums text-[#0F172A]">
        {mm}:{ss}
      </p>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F1F5F9]">
        <div className="h-full bg-[#2563EB]" style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Stay on the bus — we're resuming your route.</p>
    </>
  );
}

function RelaxingTimer({
  stopFlow,
  clamp: clampFn,
}: {
  stopFlow: StopFlow;
  clamp: (n: number, min: number, max: number) => number;
}) {
  const startedAt = stopFlow?.startedAt ?? Date.now();
  const actionSeconds = stopFlow?.actionSeconds ?? 180;
  const speedup = stopFlow?.restInPlace ? STOP_SPEEDUP_REST_IN_PLACE : STOP_SPEEDUP;
  const realTotalMs = Math.max(1000, Math.round((actionSeconds * 1000) / speedup));
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const p = clampFn(elapsedMs / realTotalMs, 0, 1);
  const remainingInWorld = Math.max(0, Math.ceil(actionSeconds - (elapsedMs * speedup) / 1000));
  const mm = String(Math.floor(remainingInWorld / 60)).padStart(2, "0");
  const ss = String(remainingInWorld % 60).padStart(2, "0");
  return (
    <>
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">
        {stopFlow?.restInPlace
          ? "Resting here"
          : stopFlow?.kind === "refuel"
            ? "Refueling"
            : stopFlow?.kind === "rejuvenate"
              ? "Rejuvenating"
              : "Relaxing"}
      </p>
      <p className="mt-2 text-sm font-extrabold tabular-nums text-[#0F172A]">
        {mm}:{ss}
      </p>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F1F5F9]">
        <div className="h-full bg-[#2563EB]" style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
    </>
  );
}
