"use client";

type Props = {
  secondsUntilStart: number;
  /** When true, overlay is shown (registered and hunt not started). */
  show: boolean;
};

/**
 * Full-screen overlay shown before hunt start: "Hunt starts in MM:SS".
 * Reusable so hunts page stays lean.
 */
export function HuntsCountdownOverlay({ secondsUntilStart, show }: Props) {
  if (!show) return null;

  const minutes = Math.floor(secondsUntilStart / 60);
  const seconds = secondsUntilStart % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-auto px-4 sm:px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm text-center space-y-4 w-full">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Hunt starts in
        </p>
        <p className="text-4xl font-black tabular-nums text-[#0F172A]">
          {mm}:{ss}
        </p>
        <p className="text-sm text-slate-600">
          You can see other Lootas on the map. Travel and treasures unlock when the hunt starts.
        </p>
      </div>
    </div>
  );
}
