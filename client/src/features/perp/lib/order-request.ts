import type { MarketConfig } from "@/shared/config/markets";
import type { OrderStatus, PlaceOrderRequest, Reason, TimeInForce } from "../api/types";
import { hashOrder, orderHashBytes, type SignedOrderFields } from "./order-codec";
import { marketLimitPrice, ORDER_TTL_MS } from "./order-math";

export interface OrderIntent {
  market: MarketConfig;
  isBuy: boolean;
  kind: "limit" | "market";
  /** limit price, USDC 1e6 */
  price?: bigint;
  /** reference for market orders */
  markPrice?: bigint;
  size: bigint;
  reduceOnly: boolean;
  /** limit only; market is always IOC */
  tif: TimeInForce;
}

export interface OrderContext {
  trader: string;
  nonce: bigint;
  nowMs: number;
}

/** Intent -> signed fields, hash, unsigned request. */
export function prepareOrder(intent: OrderIntent, ctx: OrderContext) {
  const price =
    intent.kind === "market"
      ? marketLimitPrice(intent.markPrice ?? 0n, intent.isBuy, intent.market.tickSize)
      : (intent.price ?? 0n);
  const fields: SignedOrderFields = {
    trader: ctx.trader,
    marketId: intent.market.id,
    isBuy: intent.isBuy,
    price,
    size: intent.size,
    reduceOnly: intent.reduceOnly,
    nonce: ctx.nonce,
    expiryMs: BigInt(ctx.nowMs + ORDER_TTL_MS),
  };
  const orderHash = hashOrder(fields);
  const toRequest = (publicKey: string, signature: string): PlaceOrderRequest => ({
    trader: ctx.trader,
    market: intent.market.id,
    side: intent.isBuy ? "SIDE_BUY" : "SIDE_SELL",
    type: intent.kind === "market" ? "ORDER_TYPE_MARKET" : "ORDER_TYPE_LIMIT",
    tif: intent.kind === "market" ? "TIME_IN_FORCE_IOC" : intent.tif,
    price: price.toString(),
    size: intent.size.toString(),
    reduceOnly: intent.reduceOnly,
    nonce: ctx.nonce.toString(),
    expiryMs: fields.expiryMs.toString(),
    clientId: `${ctx.nowMs}-${ctx.nonce}`,
    orderHash,
    publicKey,
    signature,
  });
  return { fields, hashBytes: orderHashBytes(fields), orderHash, toRequest };
}

const REASON_COPY: Partial<Record<Reason, string>> = {
  REASON_INSUFFICIENT_MARGIN: "Insufficient margin",
  REASON_POST_ONLY_WOULD_CROSS: "Post-only order would cross the book",
  REASON_REDUCE_ONLY_WOULD_INCREASE: "Reduce-only order would increase position",
  REASON_REDUCE_ONLY: "Reduce-only order no longer reduces",
  REASON_INVALID_LOT: "Size is not a multiple of lot size",
  REASON_INVALID_TICK: "Price is not a multiple of tick size",
  REASON_ZERO_SIZE: "Size must be greater than zero",
  REASON_MISSING_MARK: "Mark price unavailable",
  REASON_UNFILLED: "No liquidity within price band",
  REASON_SELF_TRADE: "Would self-trade",
};

export function reasonText(reason: Reason) {
  return REASON_COPY[reason] ?? reason.replace("REASON_", "").toLowerCase().replaceAll("_", " ");
}

const STATE_COPY: Record<OrderStatus["state"], string> = {
  ORDER_STATE_ACCEPTED: "open",
  ORDER_STATE_REJECTED: "rejected",
  ORDER_STATE_RESTING: "open",
  ORDER_STATE_PARTIALLY_FILLED: "partially filled",
  ORDER_STATE_FILLED: "filled",
  ORDER_STATE_CANCELLED: "cancelled",
  ORDER_STATE_CANCEL_REJECTED: "cancel rejected",
};

// engine marks a taker that part-filled then rested as RESTING
export const stateText = ({ state, filled }: Pick<OrderStatus, "state" | "filled">) =>
  state === "ORDER_STATE_RESTING" && BigInt(filled) > 0n ? STATE_COPY.ORDER_STATE_PARTIALLY_FILLED : STATE_COPY[state];
