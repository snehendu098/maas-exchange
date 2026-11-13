import { perpApi } from "@/features/perp/api/client";
import type { LeaderRow } from "@/features/perp/api/types";
import { MARKETS } from "@/shared/config/markets";
import { usdcToNumber } from "@/shared/lib/units";
import type { LeaderboardApi, TraderStats } from "./types";

/** gateway row (USDC 1e6 strings) -> table numbers. roi = pnl / (equity - pnl), i.e. vs start-of-window equity */
export function toTraderStats(r: LeaderRow): TraderStats {
  const pnl = usdcToNumber(r.pnl);
  const equity = usdcToNumber(r.equity);
  const start = equity - pnl;
  return {
    address: r.trader,
    pnl,
    roi: start > 0 ? (pnl / start) * 100 : 0,
    volume: usdcToNumber(r.volume),
    winRate: r.winRate * 100,
    trades: r.trades,
    equity,
    markets: r.markets.map((id) => MARKETS[id]?.symbol).filter((m) => m !== undefined),
    curve: r.curve.map(usdcToNumber),
  };
}

export const leaderboardApi: LeaderboardApi = {
  getTraders: async (range) => (await perpApi.getLeaderboard(range)).map(toTraderStats),
};
