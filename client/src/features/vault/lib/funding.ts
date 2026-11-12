import type { MarketSymbol } from "@/shared/config/markets";
import type { FundingRecord } from "../api/types";

export const FUNDING_INTERVAL_SEC = 3600;

export function groupByMarket(prints: FundingRecord[]) {
  const out = new Map<MarketSymbol, FundingRecord[]>();
  for (const p of prints) {
    const list = out.get(p.market) ?? [];
    list.push(p);
    out.set(p.market, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.ts - b.ts);
  return out;
}

/** ts of first print in trailing negative streak; null if latest >= 0 */
export function negativeSince(sortedPrints: FundingRecord[]): number | null {
  let since: number | null = null;
  for (let i = sortedPrints.length - 1; i >= 0 && sortedPrints[i].rate < 0n; i--) since = sortedPrints[i].ts;
  return since;
}

export interface MarketFunding {
  latest: FundingRecord | null;
  negativeSince: number | null;
}

export function summarizeFunding(prints: FundingRecord[]): Partial<Record<MarketSymbol, MarketFunding>> {
  const out: Partial<Record<MarketSymbol, MarketFunding>> = {};
  for (const [market, list] of groupByMarket(prints)) {
    out[market] = { latest: list[list.length - 1] ?? null, negativeSince: negativeSince(list) };
  }
  return out;
}

export function latestRates(summary: Partial<Record<MarketSymbol, MarketFunding>>) {
  const out: Partial<Record<MarketSymbol, bigint>> = {};
  for (const [m, s] of Object.entries(summary) as [MarketSymbol, MarketFunding][]) if (s.latest) out[m] = s.latest.rate;
  return out;
}
