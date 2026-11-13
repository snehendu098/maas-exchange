import type { SortState } from "@/shared/ui/sort-header";
import type { TraderStats } from "../api/types";

export type LeaderboardSortKey = "pnl" | "roi" | "volume" | "winRate" | "trades";
export type RankedTrader = TraderStats & { rank: number };

export const DEFAULT_SORT: SortState<LeaderboardSortKey> = { key: "pnl", direction: "desc" };

/** Official rank = pnl order; stays fixed when the table re-sorts. */
export function rankTraders(traders: readonly TraderStats[]): RankedTrader[] {
  return [...traders].sort((a, b) => b.pnl - a.pnl).map((t, i) => ({ ...t, rank: i + 1 }));
}

export function sortTraders(traders: readonly RankedTrader[], sort: SortState<LeaderboardSortKey>): RankedTrader[] {
  const dir = sort.direction === "desc" ? -1 : 1;
  return [...traders].sort((a, b) => dir * (a[sort.key] - b[sort.key]) || a.rank - b.rank);
}

/** Address prefix/substring or market symbol, case-insensitive. */
export function searchTraders(traders: readonly RankedTrader[], query: string): RankedTrader[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...traders];
  return traders.filter((t) => t.address.toLowerCase().includes(q) || t.markets.some((m) => m.toLowerCase() === q));
}

export interface LeaderboardSummary {
  traders: number;
  volume: number;
  topPnl: number;
  profitable: number;
}

export function summarize(traders: readonly TraderStats[]): LeaderboardSummary {
  return {
    traders: traders.length,
    volume: traders.reduce((a, t) => a + t.volume, 0),
    topPnl: traders.reduce((a, t) => Math.max(a, t.pnl), 0),
    profitable: traders.filter((t) => t.pnl > 0).length,
  };
}
