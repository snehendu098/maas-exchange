"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { MARKETS } from "@/shared/config/markets";
import { SearchInput } from "@/shared/ui/search-input";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { useWatchlist } from "@/features/watchlist/watchlist-provider";
import { useMarketStats } from "../../hooks/use-market-data";
import { SCOPE_OPTIONS, filterMarkets, type MarketScope, type MarketSort } from "./market-filters";
import { MarketTable } from "./market-table";

export function MarketSelectorPanel({ onSelect }: { onSelect: () => void }) {
  const watchlist = useWatchlist();
  const { byId } = useMarketStats();
  const [scope, setScope] = useState<MarketScope>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MarketSort>({ key: "volume24h", direction: "desc" });
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () =>
      filterMarkets(
        MARKETS.map((market) => ({ market, stats: byId.get(market.id) })),
        { scope, query: deferredQuery, sort, watchlist: watchlist.symbols },
      ),
    [byId, scope, deferredQuery, sort, watchlist.symbols],
  );

  return (
    <div
      role="dialog"
      aria-label="Select market"
      className="flex max-h-[min(640px,calc(100dvh-180px))] w-[min(860px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50"
    >
      <header className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="label-mono text-fg">Select market</h2>
          <p className="font-mono text-[13px] text-fg-muted">
            {rows.length} of {MARKETS.length} perps
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SearchInput autoFocus value={query} onValueChange={setQuery} placeholder="Search markets" className="flex-1" />
          <SegmentedControl aria-label="Market scope" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      </header>
      <MarketTable rows={rows} sort={sort} onSortChange={setSort} onSelect={onSelect} />
    </div>
  );
}
