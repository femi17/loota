"use client";

type CoinPackage = { coins: number; amountNgn: number };

type Props = {
  setDrawer: (id: "inventory") => void;
  payError: string | null;
  coinPackages: readonly CoinPackage[];
  formatNaira: (n: number) => string;
  startPaystackPayment: (p: CoinPackage) => void;
  paystackLoading?: boolean;
};

export function HuntsCoinsDrawerContent({
  setDrawer,
  payError,
  coinPackages,
  formatNaira,
  startPaystackPayment,
  paystackLoading = false,
}: Props) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setDrawer("inventory")}
        className="w-full px-5 py-3 rounded-full bg-white border border-[#F1F5F9] text-[#0F172A] font-extrabold text-xs uppercase tracking-[0.2em] hover:border-[#2563EB]/40 transition-colors"
      >
        Back to inventory
      </button>
      <div className="p-5 rounded-3xl bg-[#0F172A] text-white border border-white/10 relative overflow-hidden soft-shadow">
        <div className="absolute -top-10 -right-10 size-48 rounded-full bg-[#2563EB]/25 blur-[60px]" />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Buy coins
          </p>
          <p className="mt-2 text-sm text-white/80">Top up your balance with Paystack.</p>
          {payError ? <p className="mt-3 text-sm text-red-200">{payError}</p> : null}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Packages</p>
        <div className="mt-4 space-y-3">
          {coinPackages.map((p) => (
            <div
              key={p.coins}
              className="p-4 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9] flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-extrabold">{p.coins.toLocaleString()} coins</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Pay {formatNaira(p.amountNgn)}
                </p>
              </div>
              <button
                type="button"
                disabled={paystackLoading}
                onClick={() => startPaystackPayment(p)}
                className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-[#0F172A] text-white hover:bg-[#2563EB] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap min-w-[100px]"
              >
                {paystackLoading ? "Loading…" : "Paystack"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
