"use client";

import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="py-6 px-6 lg:px-12 border-t border-[#F1F5F9] bg-white flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-6 lg:gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>© {new Date().getFullYear()} LOOTA</span>
          <Link className="hover:text-[#0F172A] transition-colors" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#0F172A] transition-colors" href="/terms">
            Terms
          </Link>
        </div>
        <div className="text-[11px] text-slate-400">
          Loota by <span className="font-semibold">Thinka Platforms LTD.</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
          <span className="material-symbols-outlined text-sm text-[#10B981]">
            verified_user
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Verified session
          </span>
        </div>
      </div>
    </footer>
  );
}

