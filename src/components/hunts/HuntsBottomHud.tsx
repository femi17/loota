"use client";

import { shortenPlaceLabel } from "@/app/hunts/utils";

type Props = {
  /** When false, show ? for target and keys until the hunt starts. */
  huntHasStarted?: boolean;
  destinationLabel: string;
  keys: number;
  keysToWin: number;
};

const TARGET_MAX_CHARS = 12;

export function HuntsBottomHud({ huntHasStarted = true, destinationLabel, keys, keysToWin }: Props) {
  const rawTarget = huntHasStarted ? shortenPlaceLabel(destinationLabel) : "?";
  const showTarget =
    rawTarget.length > TARGET_MAX_CHARS ? `${rawTarget.slice(0, TARGET_MAX_CHARS)}...` : rawTarget;
  const showKeys = huntHasStarted ? `${keys}/${keysToWin}` : "?/?";

  return (
    <div className="absolute bottom-4 left-4 z-40 flex items-center gap-3 max-w-[calc(100vw-7rem)] sm:max-w-none">
      <div className="min-w-0 overflow-hidden rounded-2xl bg-white/90 px-4 py-3 backdrop-blur-md border border-[#F1F5F9] soft-shadow max-w-[260px] sm:max-w-[420px]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Target
        </p>
        <p className="text-sm font-extrabold truncate" title={rawTarget}>{showTarget}</p>
      </div>
      <div className="shrink-0 rounded-2xl bg-white/90 px-4 py-3 backdrop-blur-md border border-[#F1F5F9] soft-shadow">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keys</p>
        <p className="text-sm font-extrabold">
          {showKeys}
        </p>
      </div>
    </div>
  );
}

