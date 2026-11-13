"use client";

import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { routes } from "@/shared/config/navigation";
import { cn } from "@/shared/lib/cn";
import { formatCompactUsd, formatSignedPercent } from "@/shared/lib/format";
import { usdcToNumber } from "@/shared/lib/units";
import { SortHeader, nextSort } from "@/shared/ui/sort-header";
import { TokenLogo } from "@/shared/ui/token-logo";
import { WatchlistStar } from "@/features/watchlist/watchlist-star";
import { change24hPercent, fmtPrice, formatFunding, fundingPercent } from "../../lib/market-format";
import { FundingCountdown } from "../market-header/funding-countdown";
import type { MarketRow, MarketSort, MarketSortKey } from "./market-filters";

const GRID = "grid min-w-[720px] grid-cols-[24px_minmax(140px,1fr)_96px_96px_72px_148px_80px] items-center gap-x-3";

const SORTABLE: ReadonlyArray<{ key: MarketSortKey; label: string }> = [
  { key: "mark", label: "Mark" },
  { key: "change24h", label: "24h" },
  { key: "funding", label: "Funding" },
  { key: "volume24h", label: "Volume" },
];

interface MarketTableProps {
  rows: MarketRow[];
  sort: MarketSort;
  onSortChange: (sort: MarketSort) => void;
  onSelect: () => void;
}

export function MarketTable({ rows, sort, onSortChange, onSelect }: MarketTableProps) {
  const router = useRouter();
  const [mark, change, funding, volume] = SORTABLE;
  const handleSort = (key: MarketSortKey) => onSortChange(nextSort(sort, key));

  const open = (symbol: string) => {
    router.push(routes.trade(symbol));
    onSelect();
  };

  return (
    <div role="table" aria-label="Markets" className="scrollbar-none min-h-0 flex-1 overflow-auto">
      <div role="row" className={cn(GRID, "sticky top-0 z-10 border-b border-border bg-surface px-5 py-3")}>
        <span role="columnheader" aria-label="Watchlist" className="text-fg-muted">
          <Star className="size-3.5 fill-current" strokeWidth={1.4} />
        </span>
        <span role="columnheader" className="label-mono text-fg-muted">
          Market
        </span>
        <SortHeader column={mark} sort={sort} onSort={handleSort} />
        <span role="columnheader" className="label-mono text-right text-fg-muted">
          Index
        </span>
        <SortHeader column={change} sort={sort} onSort={handleSort} />
        <SortHeader column={funding} sort={sort} onSort={handleSort} />
        <SortHeader column={volume} sort={sort} onSort={handleSort} />
      </div>

      {rows.map(({ market, stats }) => {
        const pct = stats ? change24hPercent(stats) : 0;
        const fund = stats ? fundingPercent(stats.fundingRate) : 0;
        return (
          <div
            key={market.symbol}
            role="row"
            tabIndex={0}
            onClick={() => open(market.symbol)}
            onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open(market.symbol)}
            className={cn(
              GRID,
              "cursor-pointer border-b border-border px-5 py-3 text-[15px] tabular-nums transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none",
            )}
          >
            <span role="cell">
              <WatchlistStar symbol={market.symbol} size={14} />
            </span>
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <TokenLogo asset={market} size={26} />
              <span className="min-w-0">
                <span className="block truncate">{market.symbol}-PERP</span>
                <span className="block font-mono text-[11px] text-fg-muted">Max {market.maxLeverage}x</span>
              </span>
            </span>
            <span role="cell" className="text-right">
              {stats ? fmtPrice(stats.markPrice, market) : "—"}
            </span>
            <span role="cell" className="text-right text-fg-muted">
              {stats ? fmtPrice(stats.indexPrice, market) : "—"}
            </span>
            <span role="cell" className={cn("text-right", pct < 0 ? "text-down" : "text-up")}>
              {stats ? formatSignedPercent(pct) : "—"}
            </span>
            <span role="cell" className="flex justify-end gap-2 text-[13px]">
              <span className={fund < 0 ? "text-down" : "text-up"}>{stats ? formatFunding(fund) : "—"}</span>
              {stats && (
                <span className="text-fg-muted">
                  <FundingCountdown nextFundingTime={stats.nextFundingTime} />
                </span>
              )}
            </span>
            <span role="cell" className="text-right">
              {stats ? formatCompactUsd(usdcToNumber(stats.volume24h)) : "—"}
            </span>
          </div>
        );
      })}
      {rows.length === 0 && <p className="px-5 py-10 text-center text-[15px] text-fg-muted">No markets found</p>}
    </div>
  );
}
