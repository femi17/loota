"use client";

type Toast = {
  title: string;
  message: string;
};

type Props = {
  toast: Toast | null;
};

export function HuntsToast({ toast }: Props) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[120] max-w-[360px]">
      <div className="px-4 py-3 rounded-2xl bg-white/95 backdrop-blur-md border border-[#F1F5F9] soft-shadow">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {toast.title}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#0F172A] leading-snug">
          {toast.message}
        </p>
      </div>
    </div>
  );
}

