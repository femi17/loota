"use client";

import type { VehicleId, VehicleState } from "@/app/hunts/types";
import {
  VEHICLE_IDS,
  TRAVEL_MODES,
  MAINTENANCE_TASKS,
  MAINT_WARN_PCT,
  MAINT_WORLD_SECONDS,
  MAINT_SPEEDUP,
} from "@/app/hunts/constants";

type Props = {
  vehicleState: Record<VehicleId, VehicleState>;
  ownedModes: Set<string>;
  vehicleBlockedReason: (id: VehicleId) => string | null;
  isTraveling: boolean;
  isVehicleInUse: (modeId: VehicleId) => boolean;
  setBreakdownFlow: (v: { modeId: VehicleId } | null) => void;
  setDrawer: (id: "breakdown" | null) => void;
  startMaintenance: (id: VehicleId) => void;
};

export function HuntsGarageDrawerContent({
  vehicleState,
  ownedModes,
  vehicleBlockedReason,
  isTraveling,
  isVehicleInUse,
  setBreakdownFlow,
  setDrawer,
  startMaintenance,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Garage</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Maintenance
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Service takes 10 minutes. Service button unlocks at 50% health and below. At 10%, we'll
          warn you.
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="space-y-3">
          {VEHICLE_IDS.map((id) => {
            const owned = ownedModes.has(id);
            if (!owned) return null;
            const v = vehicleState[id];
            const pct = Math.max(0, Math.min(100, Math.round(v.healthPct)));
            const blocked = vehicleBlockedReason(id);
            const now = Date.now();
            const remainingMs = v.untilMs ? Math.max(0, v.untilMs - now) : 0;
            const remainingWorld = Math.ceil((remainingMs * MAINT_SPEEDUP) / 1000);
            const mm = String(Math.floor(remainingWorld / 60)).padStart(2, "0");
            const ss = String(remainingWorld % 60).padStart(2, "0");
            const label = TRAVEL_MODES.find((m) => m.id === id)?.label ?? id;
            const icon = TRAVEL_MODES.find((m) => m.id === id)?.icon ?? "build";
            const isVehicleInUseNow = isTraveling && isVehicleInUse(id);
            const canService = v.status === "ok" && pct <= 50 && !isVehicleInUseNow;
            return (
              <div
                key={id}
                className="p-4 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-11 rounded-2xl bg-white border border-[#F1F5F9] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#0F172A]">{icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold truncate">{label}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {blocked
                          ? `${blocked}${v.untilMs ? ` (${mm}:${ss})` : ""}`
                          : isVehicleInUseNow
                            ? "In use"
                            : pct <= MAINT_WARN_PCT
                              ? "Low health"
                              : pct <= 50
                                ? "Service available"
                                : "Healthy"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-extrabold tabular-nums text-[#0F172A]">{pct}%</p>
                </div>

                <div className="mt-3 h-2 rounded-full bg-white border border-[#F1F5F9] overflow-hidden">
                  <div
                    className={[
                      "h-full",
                      pct <= MAINT_WARN_PCT
                        ? "bg-red-500"
                        : pct <= 35
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    ].join(" ")}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {v.status === "servicing" && v.untilMs ? (
                  <div className="mt-4 space-y-2.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      Maintenance in progress
                    </p>
                    {(() => {
                      const tasks = MAINTENANCE_TASKS[id] || [];
                      const totalMs = Math.round((MAINT_WORLD_SECONDS * 1000) / MAINT_SPEEDUP);
                      const elapsedMs = totalMs - remainingMs;
                      const overallProgress = Math.min(
                        100,
                        Math.max(0, (elapsedMs / totalMs) * 100),
                      );

                      return tasks.map((task, idx) => {
                        const prevTaskPercent =
                          idx > 0 ? tasks[idx - 1]!.completionPercent : 0;
                        const taskStartPercent = prevTaskPercent;
                        const taskEndPercent = task.completionPercent;
                        const taskRange = taskEndPercent - taskStartPercent;

                        let taskProgress = 0;
                        let isCompleted = false;
                        let isActive = false;

                        if (overallProgress >= taskEndPercent) {
                          isCompleted = true;
                          taskProgress = 100;
                        } else if (overallProgress >= taskStartPercent) {
                          isActive = true;
                          taskProgress =
                            ((overallProgress - taskStartPercent) / taskRange) * 100;
                        }

                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`material-symbols-outlined text-sm shrink-0 transition-colors ${
                                    isCompleted
                                      ? "text-emerald-600"
                                      : isActive
                                        ? "text-[#2563EB] animate-pulse"
                                        : "text-slate-300"
                                  }`}
                                >
                                  {isCompleted ? "check_circle" : task.icon}
                                </span>
                                <span
                                  className={`text-xs font-bold truncate transition-colors ${
                                    isCompleted
                                      ? "text-emerald-600 line-through"
                                      : isActive
                                        ? "text-[#0F172A]"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {task.label}
                                </span>
                              </div>
                              {isActive && (
                                <span className="text-[10px] font-black text-slate-400 tabular-nums">
                                  {Math.round(taskProgress)}%
                                </span>
                              )}
                              {isCompleted && (
                                <span className="text-[10px] font-black text-emerald-600">
                                  Done
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ease-out ${
                                  isCompleted
                                    ? "bg-emerald-500"
                                    : isActive
                                      ? "bg-[#2563EB]"
                                      : "bg-transparent"
                                }`}
                                style={{ width: `${Math.round(taskProgress)}%` }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {v.status === "broken_needs_tow" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFlow({ modeId: id });
                        setDrawer("breakdown");
                      }}
                      className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-[#0F172A] text-white hover:bg-[#2563EB] transition-colors"
                    >
                      Tow & repair
                    </button>
                  ) : v.status === "ok" ? (
                    <button
                      type="button"
                      onClick={() => startMaintenance(id)}
                      disabled={!canService}
                      title={
                        isVehicleInUseNow
                          ? "Cannot service while vehicle is in use. Stop traveling first."
                          : !canService
                            ? "Service available at 50% health or below"
                            : "Start maintenance"
                      }
                      className={[
                        "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] transition-colors",
                        canService
                          ? "bg-white border border-[#F1F5F9] text-[#0F172A] hover:border-[#2563EB]/40"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed border border-[#F1F5F9]",
                      ].join(" ")}
                    >
                      Service
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-slate-100 text-slate-400 cursor-not-allowed"
                    >
                      {blocked || "Unavailable"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
