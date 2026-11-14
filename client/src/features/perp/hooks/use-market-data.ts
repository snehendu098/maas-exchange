"use client";

import { useMemo } from "react";
import { perpApi } from "../api/client";
import type { BookSnapshot, BookUpdate, Candle, CandleInterval, MarketStats, PublicTrade } from "../api/types";
import { applyBookUpdate } from "../lib/book";
import { mergeTradeIntoCandles } from "../lib/candles";
import { perpKeys } from "./query-keys";
import { useLiveQuery } from "./use-live-query";

const TRADES_KEPT = 60;

const reduceStats = (prev: MarketStats[], s: MarketStats) =>
  prev.some((p) => p.market === s.market) ? prev.map((p) => (p.market === s.market ? s : p)) : [...prev, s];

const reduceTrades = (prev: PublicTrade[], t: PublicTrade) =>
  prev.some((p) => p.tradeId === t.tradeId) ? prev : [t, ...prev].slice(0, TRADES_KEPT);

const reduceBook = (prev: BookSnapshot, u: BookUpdate) => applyBookUpdate(prev, u);

/** All market tickers keyed by market id. */
export function useMarketStats() {
  const query = useLiveQuery({
    queryKey: perpKeys.stats,
    queryFn: () => perpApi.getMarketStats(),
    subscription: { channel: "ticker" },
    reduce: reduceStats,
  });
  const data = query.data;
  const byId = useMemo(() => new Map((data ?? []).map((s) => [s.market, s])), [data]);
  return { byId, error: query.error, isLoading: query.isLoading };
}

export function useMarketStat(market: number) {
  return useMarketStats().byId.get(market);
}

export function useOrderBookSnapshot(market: number) {
  return useLiveQuery({
    queryKey: perpKeys.book(market),
    queryFn: () => perpApi.getBook(market),
    subscription: { channel: "book", market },
    reduce: reduceBook,
  });
}

export function useRecentTrades(market: number) {
  return useLiveQuery({
    queryKey: perpKeys.trades(market),
    queryFn: () => perpApi.getTrades(market, TRADES_KEPT),
    subscription: { channel: "trades", market },
    reduce: reduceTrades,
  });
}

const reduceCandles = (interval: CandleInterval) => (prev: Candle[], t: PublicTrade) =>
  mergeTradeIntoCandles(prev, t, interval);
const CANDLE_REDUCERS = {
  "1m": reduceCandles("1m"),
  "5m": reduceCandles("5m"),
  "15m": reduceCandles("15m"),
  "1h": reduceCandles("1h"),
  "4h": reduceCandles("4h"),
  "1d": reduceCandles("1d"),
} as const;

/** Candles REST + live from trade stream. */
export function useCandles(market: number, interval: CandleInterval) {
  return useLiveQuery({
    queryKey: perpKeys.candles(market, interval),
    queryFn: () => perpApi.getCandles(market, interval),
    subscription: { channel: "trades", market },
    reduce: CANDLE_REDUCERS[interval],
  });
}
