"use client";

import { useMemo } from "react";
import type { MarketConfig } from "@/shared/config/markets";
import { aggregateLevels, midPrice } from "../lib/book";
import { useOrderBookSnapshot } from "./use-market-data";

const LEVELS = 11;
const GROUP_MULTIPLIERS = [1n, 5n, 10n, 50n] as const;

/** Grouped depth for display; asks returned furthest-first. */
export function useOrderBook(market: MarketConfig, group?: bigint) {
  const { data, error, isLoading } = useOrderBookSnapshot(market.id);
  const groupSize = group ?? market.tickSize;
  const tickSizes = useMemo(() => GROUP_MULTIPLIERS.map((m) => market.tickSize * m), [market.tickSize]);

  const view = useMemo(() => {
    if (!data) return null;
    return {
      asks: aggregateLevels(data.asks, groupSize, "ask", LEVELS).reverse(),
      bids: aggregateLevels(data.bids, groupSize, "bid", LEVELS),
      mid: midPrice(data),
    };
  }, [data, groupSize]);

  return { view, tickSizes, groupSize, error, isLoading };
}
