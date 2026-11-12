import type { CandleInterval } from "../api/types";

const t = (trader: string | undefined) => trader?.toLowerCase() ?? "none";

export const perpKeys = {
  stats: ["perp", "stats"] as const,
  book: (market: number) => ["perp", "book", market] as const,
  trades: (market: number) => ["perp", "trades", market] as const,
  candles: (market: number, interval: CandleInterval) => ["perp", "candles", market, interval] as const,
  account: (trader?: string) => ["perp", "user", t(trader), "account"] as const,
  positions: (trader?: string) => ["perp", "user", t(trader), "positions"] as const,
  orders: (trader?: string) => ["perp", "user", t(trader), "orders"] as const,
  fills: (trader?: string) => ["perp", "user", t(trader), "fills"] as const,
  funding: (trader?: string) => ["perp", "user", t(trader), "funding"] as const,
  wallet: (trader?: string) => ["perp", "user", t(trader), "wallet"] as const,
  tradingKey: (trader?: string) => ["perp", "user", t(trader), "trading-key"] as const,
};
