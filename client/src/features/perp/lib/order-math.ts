import type { MarketConfig } from "@/shared/config/markets";
import { roundToStep } from "@/shared/lib/units";

/** Default protective band for market orders. */
export const MARKET_SLIPPAGE_BPS = 100;
export const ORDER_TTL_MS = 30 * 24 * 3600 * 1000;

/** Worst acceptable price for a market order, tick aligned. */
export function marketLimitPrice(mark: bigint, isBuy: boolean, tick: bigint, slippageBps = MARKET_SLIPPAGE_BPS) {
  const delta = (mark * BigInt(slippageBps)) / 10_000n;
  const raw = isBuy ? mark + delta : mark - delta;
  return roundToStep(raw > 0n ? raw : tick, tick, isBuy ? "up" : "down");
}

export function isOnStep(value: bigint, step: bigint) {
  return value > 0n && value % step === 0n;
}

/** size base 1e8 from margin * leverage / price, lot aligned down. */
export function sizeFromMargin(margin: bigint, leverage: number, price: bigint, market: MarketConfig) {
  if (price <= 0n) return 0n;
  const lev = BigInt(Math.max(1, Math.floor(leverage * 100)));
  const size = (margin * lev * 10n ** 8n) / (price * 100n);
  return roundToStep(size, market.lotSize, "down");
}

/** u64 salt, kept under 2^53 so json number u64 stays exact. */
export function randomNonce(): bigint {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(words[0] & 0x1fffff) << 32n) | BigInt(words[1]);
}
