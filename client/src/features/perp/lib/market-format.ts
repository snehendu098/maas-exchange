import type { MarketConfig } from "@/shared/config/markets";
import {
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  decimalsForStep,
  formatPriceRaw,
  formatSizeRaw,
  type RawInput,
} from "@/shared/lib/units";
import type { MarketStats } from "../api/types";

export const priceDecimals = (m: MarketConfig) => Math.max(2, decimalsForStep(m.tickSize, PRICE_DECIMALS));
export const sizeDecimals = (m: MarketConfig) => decimalsForStep(m.lotSize, SIZE_DECIMALS);

export const fmtPrice = (raw: RawInput, m: MarketConfig) => formatPriceRaw(raw, priceDecimals(m));
export const fmtSize = (raw: RawInput, m: MarketConfig) => formatSizeRaw(raw, sizeDecimals(m));

/** rate 1e18 = 100% -> percent number */
export const fundingPercent = (rate: RawInput) => Number(BigInt(rate)) / 1e16;

export function change24hPercent(s: MarketStats) {
  const open = Number(s.open24h);
  return open > 0 ? ((Number(s.markPrice) - open) / open) * 100 : 0;
}

/** 3725 -> "01:02:05" */
export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Funding to 4dp: 0.00125 -> "0.0013%" */
export const formatFunding = (pct: number) => `${pct >= 0 ? "" : "-"}${Math.abs(pct).toFixed(4)}%`;
