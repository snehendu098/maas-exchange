import type { MarketSymbol } from "@/shared/config/markets";
import type { ChartPoint } from "../../lib/chart-data";

export type ChartRow = { time: number } & Partial<Record<string, number>>;

/** per-market series -> one row per timestamp, keyed by market */
export function mergeSeries(byMarket: Map<MarketSymbol, ChartPoint[]>): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  for (const [market, points] of byMarket) {
    for (const p of points) {
      const row = rows.get(p.time) ?? { time: p.time };
      row[market] = p.value;
      rows.set(p.time, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}
