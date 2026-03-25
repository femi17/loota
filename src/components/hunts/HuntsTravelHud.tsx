"use client";

type Props = {
  visible: boolean;
  hasPrep: boolean;
  isTraveling: boolean;
  prepLabel: string;
  coordLabel: string;
  /** When true, GPS was unavailable and position is approximate; show hint to enable location. */
  locationApproximate?: boolean;
  prepSecondsLeft: number;
  modeIconName: string;
  modeLabel: string;
  tripKmLabel: string;
  travelPct: number;
  /** Plane: waiting at departure or arrival (or flying). Shown on screen so user sees progress without opening drawer. */
  planeWaitLabel?: string;
  planeWaitCountdownSec?: number | null;
  /** Total seconds for countdown (e.g. 600 for 10 min boarding); used for progress bar. */
  planeWaitTotalSec?: number | null;
  planeWaitProgressPct?: number | null;
};

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function HuntsTravelHud({
  visible,
  hasPrep,
  isTraveling,
  prepLabel,
  coordLabel,
  locationApproximate,
  prepSecondsLeft,
  modeIconName,
  modeLabel,
  tripKmLabel,
  travelPct,
  planeWaitLabel,
  planeWaitCountdownSec,
  planeWaitTotalSec,
  planeWaitProgressPct,
}: Props) {
  if (!visible) return null;

  const showPlaneWait = Boolean(planeWaitLabel);
  const planePct =
    planeWaitCountdownSec != null && planeWaitTotalSec != null && planeWaitTotalSec > 0
      ? Math.min(100, Math.round((100 * (planeWaitTotalSec - planeWaitCountdownSec)) / planeWaitTotalSec))
      : planeWaitProgressPct ?? 0;

  const ModeIcon = (
    <span
      className={[
        "material-symbols-outlined text-[#0F172A] text-lg",
        isTraveling && !showPlaneWait ? "loota-icon-wiggle" : "",
      ].join(" ")}
      aria-hidden="true"
    >
      {showPlaneWait ? "flight" : modeIconName}
    </span>
  );

  return (
    <div className="absolute bottom-4 right-4 z-40 w-[96px] sm:w-[260px] max-w-[calc(100vw-2rem)] ml-3 sm:ml-0">
      <div className="px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[#F1F5F9] soft-shadow">
        {/* Mobile: icon + percentage only; fixed width so double-digit % doesn't push into KEYS card */}
        <div className="flex sm:hidden items-center justify-between gap-2 min-h-[34px] w-full">
          {ModeIcon}
          <div className="flex items-baseline gap-0.5 shrink-0">
            <p className="text-base font-extrabold tabular-nums leading-none text-[#0F172A]">
              {showPlaneWait ? planePct : hasPrep ? prepSecondsLeft : travelPct}
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
              {showPlaneWait ? "%" : hasPrep ? "s" : "%"}
            </p>
          </div>
        </div>

        {/* Desktop: full card */}
        <div className="hidden sm:block">
          {showPlaneWait ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  {ModeIcon}
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate leading-none">
                    {planeWaitLabel}
                  </p>
                </div>
                {planeWaitCountdownSec != null ? (
                  <p className="text-sm font-extrabold tabular-nums text-[#0F172A] shrink-0">
                    {formatCountdown(planeWaitCountdownSec)}
                  </p>
                ) : planeWaitProgressPct != null ? (
                  <p className="text-sm font-extrabold tabular-nums text-[#0F172A] shrink-0">
                    {planeWaitProgressPct}%
                  </p>
                ) : null}
              </div>
              {(planeWaitCountdownSec != null || planeWaitProgressPct != null) && (
                <div className="h-1.5 rounded-full bg-white border border-[#F1F5F9] overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] transition-all duration-500"
                    style={{
                      width:
                        planeWaitCountdownSec != null && planeWaitTotalSec != null && planeWaitTotalSec > 0
                          ? `${Math.min(100, (100 * (planeWaitTotalSec - planeWaitCountdownSec)) / planeWaitTotalSec)}%`
                          : `${planeWaitProgressPct ?? 0}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ) : hasPrep ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {ModeIcon}
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate leading-none">
                    {prepLabel}
                  </p>
                </div>
                <p className="mt-1 text-sm font-extrabold tabular-nums text-[#0F172A] truncate leading-tight">
                  {coordLabel}
                </p>
                {locationApproximate ? (
                  <p className="mt-0.5 text-[10px] text-amber-600 font-medium leading-tight">
                    Approximate — enable location for accuracy
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 size-14 rounded-full bg-white border border-[#F1F5F9] soft-shadow grid place-items-center">
                <div className="text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <p className="text-lg font-extrabold tabular-nums leading-none">
                      {prepSecondsLeft}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
                      s
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {ModeIcon}
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate leading-none">
                    {modeLabel}
                    {tripKmLabel ? ` - ${tripKmLabel}` : ""}
                  </p>
                </div>
                <p className="mt-1 text-sm font-extrabold tabular-nums text-[#0F172A] truncate leading-tight">
                  {coordLabel}
                </p>
                {locationApproximate ? (
                  <p className="mt-0.5 text-[10px] text-amber-600 font-medium leading-tight">
                    Approximate — enable location for accuracy
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 size-14 rounded-full bg-white border border-[#F1F5F9] soft-shadow grid place-items-center">
                <div className="text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <p className="text-lg font-extrabold tabular-nums leading-none">
                      {travelPct}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
                      %
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

