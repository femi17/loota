"use client";

type StopKind = "rejuvenate" | "refuel" | "rest";

const STOP_ICON_AND_LABEL: Record<StopKind, { icon: string; label: string }> = {
  refuel: { icon: "local_gas_station", label: "Refuel" },
  rejuvenate: { icon: "spa", label: "Relax" },
  rest: { icon: "spa", label: "Relax" },
};

type Props = {
  /** Show the floating button (stop or hospital pending, drawer not already open). */
  show: boolean;
  /** When true, label/icon are for hospital; otherwise for stop/constraint. */
  isHospital: boolean;
  /** When isHospital is false, use this to show the right stop icon/label (refuel = gas, rest/rejuvenate = relax). */
  stopKind?: StopKind | null;
  /** Optional countdown in seconds (e.g. bus stop / relaxing). */
  countdownSec?: number | null;
  /** When traveling to the stop: show progress in this same card instead of a separate travel HUD. */
  travelPct?: number | null;
  travelModeLabel?: string | null;
  travelTripKmLabel?: string | null;
  travelCoordLabel?: string | null;
  travelModeIconName?: string | null;
  /** When countdown is 0 and action is available: label for the action button (e.g. "Pay & continue"). */
  actionLabel?: string | null;
  /** Called when user taps the action button. */
  onAction?: () => void | Promise<void>;
  /** When true, action button shows loading state. */
  actionLoading?: boolean;
  onOpen: () => void;
};

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Floating button shown when a stop (refuel/rest) or hospital flow is pending
 * but the corresponding drawer is closed. Gives user a way back in.
 */
export function HuntsStopGatewayButton({
  show,
  isHospital,
  stopKind,
  countdownSec,
  travelPct,
  travelModeLabel,
  travelTripKmLabel,
  travelCoordLabel,
  travelModeIconName,
  actionLabel,
  onAction,
  actionLoading = false,
  onOpen,
}: Props) {
  if (!show) return null;

  const isStop = !isHospital;
  const stopSpec = isStop && stopKind ? STOP_ICON_AND_LABEL[stopKind] : null;
  const icon = isHospital ? "local_hospital" : stopSpec?.icon ?? "warning";
  const label = isHospital ? "Hospital" : stopSpec?.label ?? "Stop";
  const showCountdown =
    countdownSec != null && Number.isFinite(countdownSec) && countdownSec > 0;
  const showActionButton =
    countdownSec === 0 && actionLabel && onAction && !showCountdown && !(travelPct != null && Number.isFinite(travelPct));
  const showTravelProgress =
    travelPct != null && Number.isFinite(travelPct) && !showCountdown;

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    void onAction?.();
  };

  const content = (
    <>
      {showTravelProgress ? (
        <>
          {/* Mobile: icon + percentage only (same layout as travel HUD) */}
          <div className="flex sm:hidden items-center justify-between gap-2 px-4 py-3 min-h-[52px] w-full">
            <span className="material-symbols-outlined text-[#0F172A] text-lg" aria-hidden>
              {travelModeIconName ?? icon}
            </span>
            <div className="flex items-baseline gap-0.5 shrink-0">
              <span className="text-base font-extrabold tabular-nums leading-none text-[#0F172A]">
                {Math.round(travelPct)}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
                %
              </span>
            </div>
          </div>
          {/* Desktop: label + progress (same card style as travel HUD) */}
          <div className="hidden sm:flex items-center justify-between gap-3 px-4 py-3 min-h-[52px]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[#0F172A] text-lg" aria-hidden>
                  {travelModeIconName ?? icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate leading-none">
                  {label}
                  {travelTripKmLabel ? ` - ${travelTripKmLabel}` : ""}
                </span>
              </div>
              {travelCoordLabel ? (
                <p className="mt-1 text-sm font-extrabold tabular-nums text-[#0F172A] truncate leading-tight">
                  {travelCoordLabel}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 size-14 rounded-full bg-white border border-[#F1F5F9] soft-shadow grid place-items-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-lg font-extrabold tabular-nums leading-none">{Math.round(travelPct)}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
                  %
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Same visual language as HuntsBottomHud: uppercase micro-label + bold value, px-4 py-3 */
        <div
          className={`w-full min-w-0 ${
            showActionButton
              ? "h-[52px] px-1.5 py-2.5 flex flex-col items-center justify-center gap-1"
              : "px-4 py-3 min-h-[52px] flex items-start justify-start"
          }`}
        >
          <div className={`min-w-0 ${showActionButton ? "flex flex-col items-center justify-center" : "flex flex-col items-start justify-center"}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none ${showActionButton ? "text-center" : ""}`}>
              {label}
            </p>
            {showCountdown ? (
              <p className="mt-1.5 text-sm font-extrabold tabular-nums text-[#0F172A] tracking-tight">
                {formatCountdown(countdownSec)}
              </p>
            ) : showActionButton ? null : (
              <p className="mt-1 text-sm font-extrabold text-[#0F172A] uppercase">Open</p>
            )}
          </div>
          {showActionButton ? (
            <div className="self-center">
              <button
                type="button"
                onClick={handleAction}
                disabled={actionLoading}
                className="shrink-0 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider bg-[#0F172A] text-white hover:bg-[#2563EB] active:scale-[0.98] transition-all disabled:bg-slate-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                {actionLoading ? (
                  <>
                    <span className="inline-block size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
                    …
                  </>
                ) : (
                  actionLabel
                )}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  const shellWidth = showTravelProgress
    ? "w-[96px] sm:w-[260px] max-w-[calc(100vw-2rem)]"
    : showActionButton
      ? "w-auto min-w-[7.5rem] max-w-[170px] sm:max-w-[190px]"
      : "w-auto min-w-[86px] max-w-[120px]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={`fixed bottom-4 right-4 z-50 flex rounded-2xl bg-white/90 backdrop-blur-md border border-[#F1F5F9] soft-shadow hover:bg-slate-50 active:scale-[0.98] transition-all text-left cursor-pointer ${shellWidth}`}
      aria-label={isHospital ? "Open hospital" : `Open ${label.toLowerCase()}`}
    >
      {content}
    </div>
  );
}
