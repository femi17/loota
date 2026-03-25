"use client";

import { formatCoins } from "@/lib/travel-config";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  credits: number;
  huntersHunting: number;
  onClose: () => void;
  /** When false, backdrop and close button do nothing. Stop/constraint/hospital drawers are closeable so user can dismiss and use the bottom-right gateway to return. */
  closeable?: boolean;
  children: ReactNode;
};

export function HuntsDrawerShell({
  open,
  title,
  credits,
  huntersHunting,
  onClose,
  closeable = true,
  children,
}: Props) {
  return (
    <div
      className={[
        "fixed inset-0 z-[100] transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={closeable ? onClose : undefined}
        className="absolute inset-0 bg-black/25 touch-manipulation"
        aria-label="Close drawer"
        style={closeable ? undefined : { pointerEvents: "none" }}
      />

      <aside
        className={[
          "absolute top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-[#F1F5F9] shadow-2xl transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="h-20 px-6 border-b border-[#F1F5F9] flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</p>

          <div className="flex items-center gap-2">
            <div className="h-10 px-3 rounded-full bg-[#F8FAFC] border border-[#F1F5F9] flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#F59E0B] text-base fill-1">
                  database
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 tabular-nums">
                  {formatCoins(credits)}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#2563EB] text-base">groups</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 tabular-nums">
                  {huntersHunting.toLocaleString()}
                </span>
              </div>
            </div>

            {closeable ? (
              <button
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] size-10 sm:size-10 rounded-full hover:bg-[#F8FAFC] active:bg-[#F1F5F9] transition-colors flex items-center justify-center touch-manipulation"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-slate-500 text-xl">close</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="h-[calc(100%-80px)] overflow-y-auto p-6 space-y-6">{children}</div>
      </aside>
    </div>
  );
}

