"use client";

export type TravelModeForLeaderboard = { id: string; label: string; icon: string };

export type LeaderboardRow = {
  id: string;
  name?: string;
  avatarUrl?: string;
  keys: number;
  /** Credits spent in this hunt (Loota) */
  loota?: number;
  inventory: string[];
  currentMode: string;
  traveling: boolean;
  you: boolean;
};

type Props = {
  rank: number;
  list: LeaderboardRow[];
  travelModes: TravelModeForLeaderboard[];
  loading?: boolean;
};

export function HuntsLeaderboardDrawerContent({ rank, list, travelModes, loading }: Props) {
  const displayList = list.slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Hunt leaderboard
            </p>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Your rank: #{rank}</p>
          </div>
          <div className="size-12 rounded-2xl bg-white border border-[#F1F5F9] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#0F172A]">leaderboard</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          Ranked by keys collected.
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">
          Top hunters
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading leaderboard…</p>
        ) : null}

        <div className="mt-4 space-y-2">
          {displayList.map((r, idx) => {
            const mode = travelModes.find((m) => m.id === r.currentMode);
            const modeIcon = mode ? (mode.id === "plane" ? "flight" : mode.icon) : "directions_walk";
            const modeLabel = mode?.label ?? "Walk";
            return (
              <div
                key={r.id}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-2xl border",
                  r.you ? "bg-[#0F172A] text-white border-white/10" : "bg-[#F8FAFC] border-[#F1F5F9]",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-8 rounded-xl flex items-center justify-center font-black text-sm tabular-nums shrink-0",
                    r.you ? "bg-white/15 text-white" : "bg-white text-[#0F172A] border border-[#F1F5F9]",
                  ].join(" ")}
                >
                  {idx + 1}
                </span>
                <div className="size-9 rounded-full overflow-hidden border border-white/20 bg-white/10 shrink-0">
                  <img
                    src={r.avatarUrl ?? ""}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div
                  className={[
                    "size-9 rounded-xl flex items-center justify-center shrink-0",
                    r.you ? "bg-white/15" : "bg-white border border-[#F1F5F9]",
                  ].join(" ")}
                  title={modeLabel}
                >
                  <span
                    className={["material-symbols-outlined", r.you ? "text-white" : "text-[#0F172A]"].join(" ")}
                    style={{ fontSize: 20 }}
                  >
                    {modeIcon}
                  </span>
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-end gap-1.5">
                  <span className={["material-symbols-outlined text-lg", r.you ? "text-white/90" : "text-[#0F172A]"].join(" ")}>
                    key
                  </span>
                  <span className={["text-sm font-black tabular-nums", r.you ? "text-white" : "text-[#0F172A]"].join(" ")}>
                    {r.keys}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
