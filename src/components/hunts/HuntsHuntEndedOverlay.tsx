"use client";

import Link from "next/link";

type Props = {
  show: boolean;
};

/**
 * Full-screen overlay when the hunt's scheduled end_date has passed (gameplay locked).
 */
export function HuntsHuntEndedOverlay({ show }: Props) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[2px] pointer-events-auto px-4 sm:px-6">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 border border-slate-200">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Time&apos;s up</p>
        <p className="text-xl sm:text-2xl font-black text-[#0F172A] leading-tight">This hunt has ended</p>
        <p className="text-sm text-slate-600 leading-relaxed">
          The scheduled end time has passed. Check the lobby for the next hunt.
        </p>
        <Link
          href="/lobby"
          className="inline-flex w-full sm:w-auto min-h-[44px] items-center justify-center rounded-full bg-[#0F172A] px-6 py-3 text-white font-extrabold text-xs uppercase tracking-widest hover:bg-[#2563EB] transition-colors"
        >
          Go to lobby
        </Link>
      </div>
    </div>
  );
}
