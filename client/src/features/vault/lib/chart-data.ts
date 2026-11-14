import { fundingPercent } from "@/features/perp/lib/market-format";
import type { MarketSymbol } from "@/shared/config/markets";
import type { FundingRecord } from "../api/types";
import { groupByMarket } from "./funding";

export interface ChartPoint {
  time: number;
  value: number;
}

/** chart lib wants strictly ascending unique times */
function dedupe(points: ChartPoint[]) {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  return sorted.filter((p, i) => i === sorted.length - 1 || p.time !== sorted[i + 1].time);
}

/** funding % per print, per market */
export function fundingSeries(prints: FundingRecord[]): Map<MarketSymbol, ChartPoint[]> {
  const out = new Map<MarketSymbol, ChartPoint[]>();
  for (const [m, list] of groupByMarket(prints)) out.set(m, dedupe(list.map((p) => ({ time: p.ts, value: fundingPercent(p.rate) }))));
  return out;
}
