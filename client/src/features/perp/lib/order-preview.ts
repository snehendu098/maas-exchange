import type { MarketConfig } from "@/shared/config/markets";
import type { TimeInForce } from "../api/types";
import { PRICE_DECIMALS, SIZE_DECIMALS, USDC_DECIMALS, mulBpsUp, notional, tryParse } from "@/shared/lib/units";
import { sizeFromMargin } from "./order-math";
import { applyFill, liquidationPrice, marginForLeverage } from "./position-math";

export interface OrderFormValues {
  isBuy: boolean;
  kind: "limit" | "market";
  price: string;
  /** size typed in base units or as USDC notional */
  size: string;
  sizeUnit: "base" | "usdc";
  leverage: number;
  reduceOnly: boolean;
  tif: TimeInForce;
}

export interface PreviewContext {
  market: MarketConfig;
  mark: bigint | null;
  /** equity - IM, USDC 1e6 */
  available: bigint;
  collateral: bigint;
  position: { size: bigint; entryNotional: bigint };
}

export interface OrderPreview {
  price: bigint | null;
  size: bigint | null;
  notional: bigint;
  margin: bigint;
  fee: bigint;
  /** from mark + order value only */
  liqPrice: number | null;
  error: string | null;
}

function validate(v: OrderFormValues, ctx: PreviewContext, price: bigint | null, size: bigint | null, margin: bigint) {
  if (ctx.mark === null) return "Waiting for mark price";
  if (v.kind === "limit" && price === null) return "Enter a price";
  if (price !== null && price % ctx.market.tickSize !== 0n) return "Price off tick";
  if (size === null || size === 0n) return "Enter a size";
  if (size % ctx.market.lotSize !== 0n) return "Size off lot";
  if (!v.reduceOnly && margin > ctx.available) return "Insufficient margin";
  return null;
}

/** order value filled at mark on top of the open position; taker fee, so kind / leverage / limit don't move it */
function estimateLiq(isBuy: boolean, value: bigint, ctx: PreviewContext): number | null {
  if (!ctx.mark || value <= 0n) return null;
  const size = sizeFromMargin(value, 1, ctx.mark, ctx.market);
  if (size === 0n) return null;
  const next = { ...ctx.position };
  applyFill(next, isBuy, size, ctx.mark);
  return liquidationPrice({ ...next, mmrBps: ctx.market.mmrBps, marginBuffer: ctx.collateral - mulBpsUp(value, ctx.market.takerFeeBps) });
}

/** Pure form -> numbers + validation for the order ticket. */
export function previewOrder(v: OrderFormValues, ctx: PreviewContext): OrderPreview {
  const limit = v.kind === "limit" ? tryParse(v.price, PRICE_DECIMALS) : null;
  const price = v.kind === "limit" ? limit : ctx.mark;
  const usdc = v.sizeUnit === "usdc" ? tryParse(v.size, USDC_DECIMALS) : null;
  const ref = price ?? ctx.mark;
  // usdc mode: notional / (limit ?? mark), lot aligned down (= margin at 1x)
  const size = v.sizeUnit === "base" ? tryParse(v.size, SIZE_DECIMALS) : usdc !== null && ref ? sizeFromMargin(usdc, 1, ref, ctx.market) : null;
  const n = price && size ? notional(size, price) : 0n;
  const margin = marginForLeverage(n, v.leverage);
  const feeBps = v.kind === "market" || v.tif === "TIME_IN_FORCE_IOC" ? ctx.market.takerFeeBps : ctx.market.makerFeeBps;
  const fee = mulBpsUp(n, feeBps);

  const liqPrice = estimateLiq(v.isBuy, n, ctx);

  return { price, size, notional: n, margin, fee, liqPrice, error: validate(v, ctx, price, size, margin) };
}
