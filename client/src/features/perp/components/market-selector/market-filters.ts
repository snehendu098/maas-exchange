import type { MarketConfig } from "@/shared/config/markets";
import type { SortState } from "@/shared/ui/sort-header";
import type { MarketStats } from "../../api/types";
import { change24hPercent, fundingPercent } from "../../lib/market-format";

export type MarketScope = "all" | "watchlist";
export type MarketSortKey = "mark" | "change24h" | "funding" | "volume24h";
export type MarketSort = SortState<MarketSortKey>;

export const SCOPE_OPTIONS = [
  { value: "all", label: "All perps" },
  { value: "watchlist", label: "Watchlist" },
] as const satisfies ReadonlyArray<{ value: MarketScope; label: string }>;

export interface MarketRow {
  market: MarketConfig;
  stats?: MarketStats;
}

interface FilterInput {
  scope: MarketScope;
  query: string;
  sort: MarketSort;
  watchlist: readonly string[];
}

function sortValue(row: MarketRow, key: MarketSortKey) {
  const s = row.stats;
  if (!s) return 0;
  if (key === "mark") return Number(s.markPrice);
  if (key === "change24h") return change24hPercent(s);
  if (key === "funding") return fundingPercent(s.fundingRate);
  return Number(s.volume24h);
}

/** Pure filter + sort for the selector table. */
export function filterMarkets(rows: readonly MarketRow[], input: FilterInput): MarketRow[] {
  const q = input.query.trim().toLowerCase();
  const sign = input.sort.direction === "asc" ? 1 : -1;
  return rows
    .filter((r) => input.scope === "all" || input.watchlist.includes(r.market.symbol))
    .filter((r) => !q || r.market.symbol.toLowerCase().includes(q) || r.market.name.toLowerCase().includes(q))
    .sort((a, b) => (sortValue(a, input.sort.key) - sortValue(b, input.sort.key)) * sign);
}
