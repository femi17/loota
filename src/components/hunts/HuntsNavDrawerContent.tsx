"use client";

import Link from "next/link";

type Props = {
  /** When true, show a "Back to stop" entry so the user can return to the stop/constraint decision. */
  hasPendingStop?: boolean;
  onOpenStop?: () => void;
};

export function HuntsNavDrawerContent({ hasPendingStop, onOpenStop }: Props) {
  return (
    <div className="space-y-3">
      {hasPendingStop && onOpenStop ? (
        <button
          type="button"
          onClick={onOpenStop}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <span className="text-sm font-extrabold text-amber-800">Stop — decide</span>
          <span className="material-symbols-outlined text-amber-600">arrow_forward</span>
        </button>
      ) : null}
      <Link
        href="/lobby"
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]"
      >
        <span className="text-sm font-extrabold">Lobby</span>
        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
      </Link>
      <Link
        href="/inventory"
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]"
      >
        <span className="text-sm font-extrabold">Inventory</span>
        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
      </Link>
      <Link
        href="/"
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-[#F1F5F9]"
      >
        <span className="text-sm font-extrabold">Home</span>
        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
      </Link>
    </div>
  );
}
