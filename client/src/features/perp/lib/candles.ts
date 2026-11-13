import type { Candle, CandleInterval, PublicTrade } from "../api/types";

export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14_400,
  "1d": 86_400,
};

const max = (a: string, b: string) => (BigInt(a) > BigInt(b) ? a : b);
const min = (a: string, b: string) => (BigInt(a) < BigInt(b) ? a : b);

/** Fold a print into the last bar or open a new one. */
export function mergeTradeIntoCandles(candles: Candle[], trade: PublicTrade, interval: CandleInterval): Candle[] {
  const step = INTERVAL_SECONDS[interval];
  const barTime = Math.floor(trade.time / 1000 / step) * step;
  const last = candles.at(-1);
  const p = trade.price;
  if (!last) return [{ time: barTime, open: p, high: p, low: p, close: p, volume: trade.size }];
  if (barTime < last.time) return candles;
  if (barTime === last.time) {
    const next: Candle = {
      ...last,
      high: max(last.high, trade.price),
      low: min(last.low, trade.price),
      close: trade.price,
      volume: (BigInt(last.volume) + BigInt(trade.size)).toString(),
    };
    return [...candles.slice(0, -1), next];
  }
  return [...candles, { time: barTime, open: last.close, high: max(last.close, p), low: min(last.close, p), close: p, volume: trade.size }];
}
