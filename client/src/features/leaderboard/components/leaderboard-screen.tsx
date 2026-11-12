"use client";

import { formatCompactUsd, formatSignedUsd } from "@/shared/lib/format";
import { Enter } from "@/shared/ui/motion/enter";
import { SearchInput } from "@/shared/ui/search-input";
import { StatBox, StatStrip } from "@/shared/ui/stat-box";
import { TabBar } from "@/shared/ui/tab-bar";
import { useTrader } from "@/features/perp/hooks/use-user-data";
import type { LeaderboardRange } from "../api/types";
import { useLeaderboard } from "../hooks/use-leaderboard";
import { LeaderboardTable } from "./leaderboard-table";

const RANGES = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "All" },
] as const satisfies ReadonlyArray<{ value: LeaderboardRange; label: string }>;

/** Leaderboard: summary strip, range + search, ranked table (live gateway /leaderboard). */
export function LeaderboardScreen() {
  const board = useLeaderboard();
  const me = useTrader();

  return (
    <Enter className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col border-b border-border lg:h-[84px] lg:flex-row lg:items-stretch">
        <div className="flex min-h-16 shrink-0 flex-col justify-center border-b border-border px-6 lg:border-b-0 lg:pr-8">
          <h1 className="text-xl leading-tight">Leaderboard</h1>
          <span className="font-mono text-[11px] text-fg-muted">Top perp traders · realized − fees − funding + open PnL</span>
        </div>
        <StatStrip className="sm:grid-cols-3 lg:border-l lg:border-border">
          <StatBox label="Traders" value={board.summary.traders} extra={`${board.summary.profitable} in profit`} />
          <StatBox label="Volume" value={formatCompactUsd(board.summary.volume)} />
          <StatBox label="Top PnL" value={formatSignedUsd(board.summary.topPnl, 0)} tone="up" />
        </StatStrip>
      </header>

      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <TabBar aria-label="Range" options={RANGES} value={board.range} onChange={board.setRange} size="sm" bordered={false} />
        <SearchInput value={board.query} onValueChange={board.setQuery} placeholder="Search account or market" className="sm:w-72" />
      </div>

      {board.isLoading ? (
        <p className="px-6 py-16 text-center text-sm text-fg-muted">Loading traders…</p>
      ) : (
        <LeaderboardTable rows={board.rows} sort={board.sort} onSort={board.onSort} me={me} />
      )}
    </Enter>
  );
}
