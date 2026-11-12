import type { MarketSymbol } from "@/shared/config/markets";
import type { LivePrices } from "@/shared/lib/live-prices";

/** Live USD -> USDC raw (1e6) for `market`, else `fallback`. */
export function liveRefPrice(live: LivePrices, market: MarketSymbol, fallback: bigint): bigint {
  const usd = live[market];
  const raw = usd ? BigInt(Math.round(usd * 1e6)) : 0n;
  return raw > 0n ? raw : fallback;
}
