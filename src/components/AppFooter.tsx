"use client";

export function AppFooter() {
  return (
    <footer className="py-6 px-6 lg:px-12 border-t border-[#F1F5F9] bg-white flex items-center justify-between">
      <div className="flex items-center gap-6 lg:gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>© {new Date().getFullYear()} LOOTA</span>
        <a className="hover:text-[#0F172A] transition-colors" href="#">
          Security
        </a>
        <a className="hover:text-[#0F172A] transition-colors" href="#">
          Terms of Hunt
        </a>
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

