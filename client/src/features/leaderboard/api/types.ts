import type { MarketSymbol } from "@/shared/config/markets";

export type LeaderboardRange = "24h" | "7d" | "30d" | "all";

/** One ranked trader over a range; USD numbers, roi/winRate as percent. */
export interface TraderStats {
  address: string;
  pnl: number;
  roi: number;
  volume: number;
  winRate: number;
  trades: number;
  /** collateral + unrealized, now */
  equity: number;
  markets: MarketSymbol[];
  /** cumulative pnl, oldest first */
  curve: number[];
}

export interface LeaderboardApi {
  getTraders(range: LeaderboardRange): Promise<TraderStats[]>;
}
