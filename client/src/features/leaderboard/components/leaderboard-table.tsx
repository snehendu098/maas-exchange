"use client";

import { getMarket } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { addressUrl } from "@/shared/lib/explorer";
import { formatCompactUsd, formatSignedPercent, formatSignedUsd, truncateAddress } from "@/shared/lib/format";
import { AddressAvatar } from "@/shared/ui/address-avatar";
import { SortHeader, type SortState } from "@/shared/ui/sort-header";
import { TokenLogo } from "@/shared/ui/token-logo";
import type { LeaderboardSortKey, RankedTrader } from "../lib/ranking";
import { PnlSparkline } from "./pnl-sparkline";

const GRID = "grid min-w-[960px] grid-cols-[48px_minmax(200px,1.4fr)_120px_88px_100px_80px_72px_96px] items-center gap-x-4";

const COLUMNS: ReadonlyArray<{ key: LeaderboardSortKey; label: string }> = [
  { key: "pnl", label: "PnL" },
  { key: "roi", label: "ROI" },
  { key: "volume", label: "Volume" },
  { key: "winRate", label: "Win rate" },
  { key: "trades", label: "Trades" },
];

const MEDAL = ["text-brand", "text-fg", "text-fg-muted"];

interface LeaderboardTableProps {
  rows: readonly RankedTrader[];
  sort: SortState<LeaderboardSortKey>;
  onSort: (key: LeaderboardSortKey) => void;
  me?: string;
}

/** Ranked traders grid; account links to explorer. */
export function LeaderboardTable({ rows, sort, onSort, me }: LeaderboardTableProps) {
  return (
    <div role="table" aria-label="Leaderboard" className="scrollbar-none min-h-0 flex-1 overflow-auto">
      <div role="row" className={cn(GRID, "sticky top-0 z-10 border-b border-border bg-surface px-6 py-3")}>
        <span role="columnheader" className="label-mono text-fg-muted">#</span>
        <span role="columnheader" className="label-mono text-fg-muted">Trader</span>
        {COLUMNS.map((c) => (
          <SortHeader key={c.key} column={c} sort={sort} onSort={onSort} />
        ))}
        <span role="columnheader" className="label-mono text-right text-fg-muted">Trend</span>
      </div>

      {rows.map((t) => {
        const self = me?.toLowerCase() === t.address.toLowerCase();
        return (
          <div key={t.address} role="row" className={cn(GRID, "h-16 border-b border-border px-6 text-sm tabular-nums transition-colors hover:bg-surface-raised/40")}>
            <span role="cell" className={cn("font-mono text-[13px]", MEDAL[t.rank - 1] ?? "text-fg-muted")}>{t.rank}</span>
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <AddressAvatar address={t.address} className="size-8" />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                  <a href={addressUrl(t.address)} target="_blank" rel="noreferrer" title={t.address} className="truncate font-mono text-[13px] text-fg hover:underline">
                    {truncateAddress(t.address, 6, 4)}
                  </a>
                  {self && <span className="text-[11px] text-brand">You</span>}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-fg-muted">
                  {t.markets.map((m) => {
                    const market = getMarket(m);
                    return market ? <TokenLogo key={m} asset={market} size={12} /> : null;
                  })}
                </span>
              </span>
            </span>
            <span role="cell" className={cn("text-right font-medium", t.pnl < 0 ? "text-down" : "text-up")}>{formatSignedUsd(t.pnl, 0)}</span>
            <span role="cell" className={cn("text-right", t.roi < 0 ? "text-down" : "text-up")}>{formatSignedPercent(t.roi, 1)}</span>
            <span role="cell" className="text-right text-fg">{formatCompactUsd(t.volume)}</span>
            <span role="cell" className="text-right text-fg">{t.winRate.toFixed(1)}%</span>
            <span role="cell" className="text-right text-fg-muted">{t.trades.toLocaleString("en-US")}</span>
            <span role="cell" className="flex justify-end">
              <PnlSparkline points={t.curve} />
            </span>
          </div>
        );
      })}

      {rows.length === 0 && <p className="px-6 py-16 text-center text-sm text-fg-muted">No traders match.</p>}
    </div>
  );
}
