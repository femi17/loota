"use client";

export type SearchResult = {
  id: string;
  place_name: string;
  center: [number, number];
};

type Props = {
  searchQuery: string;
  searchLoading: boolean;
  searchError: string | null;
  searchResults: SearchResult[];
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelectResult: (result: SearchResult) => void;
  fmtCoord: (n: number) => string;
};

export function HuntsDestinationDrawerContent({
  searchQuery,
  searchLoading,
  searchError,
  searchResults,
  onQueryChange,
  onSearch,
  onSelectResult,
  fmtCoord,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rule</p>
        <p className="mt-2 text-sm text-slate-700 leading-relaxed">
          You can’t drag markers. Enter an address and we’ll plot it.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:border-[#2563EB]/40"
          placeholder="Enter address or place…"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searchLoading || !searchQuery.trim()}
          className={[
            "px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-colors",
            !searchLoading && searchQuery.trim()
              ? "bg-[#0F172A] text-white hover:bg-[#2563EB]"
              : "bg-slate-100 text-slate-400 cursor-not-allowed",
          ].join(" ")}
        >
          {searchLoading ? "Searching" : "Search"}
        </button>
      </div>

      {searchError ? <p className="text-xs text-red-600">{searchError}</p> : null}

      {searchResults.length > 0 ? (
        <div className="space-y-2">
          {searchResults.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectResult(r)}
              className="w-full text-left p-4 rounded-2xl bg-white border border-[#F1F5F9] hover:border-[#2563EB]/40 transition-colors"
            >
              <p className="text-sm font-extrabold">{r.place_name}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {fmtCoord(r.center[1])}, {fmtCoord(r.center[0])}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
