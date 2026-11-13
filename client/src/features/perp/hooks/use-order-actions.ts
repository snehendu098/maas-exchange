"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { errorMessage } from "@/shared/lib/errors";
import { formatSizeRaw } from "@/shared/lib/units";
import { toast } from "@/shared/ui/toast/toast-store";
import { perpApi } from "../api/client";
import type { Order, OrderStatus } from "../api/types";
import { randomNonce } from "../lib/order-math";
import { prepareOrder, reasonText, stateText, type OrderIntent } from "../lib/order-request";
import { signHash } from "../lib/trading-key";
import { useTrader } from "./use-user-data";
import { useTradingKey } from "./use-trading-key";

// live POST answers ACCEPTED before the engine; its verdict comes on WS user:<addr>, maybe before the POST reply
// orderId -> toast label ("Long 0.01 BTC")
const pending = new Map<string, string>();
const early = new Map<string, Order>();

/** One toast per placed order, from POST reply or engine verdict. */
function toastOutcome(o: OrderStatus, label: string) {
  const text = stateText(o);
  if (o.state === "ORDER_STATE_REJECTED") toast.error("Order rejected", reasonText(o.reason));
  else if (o.state === "ORDER_STATE_CANCELLED") {
    if (o.reason !== "REASON_USER") toast.error(`${label} cancelled`, reasonText(o.reason)); // user cancel toasts itself
  } else if (o.state === "ORDER_STATE_FILLED") toast.success(`${label} ${text}`);
  else toast.success(`${label} ${text}`, text === "open" ? "Resting in book" : "Rest open in book");
}

/** Toasts the engine verdict of orders the gateway only ACCEPTED. Mount once. */
export function useOrderRejections(trader?: string) {
  useEffect(() => {
    if (!trader) return;
    return perpApi.subscribe({ channel: "user", trader }, (e) => {
      if (e.type !== "order" || e.order.state === "ORDER_STATE_ACCEPTED") return;
      const id = e.order.orderId;
      const label = pending.get(id);
      if (label !== undefined) {
        pending.delete(id);
        toastOutcome(e.order, label);
      } else {
        early.set(id, e.order);
        if (early.size > 50) early.delete(early.keys().next().value!);
      }
    });
  }, [trader]);
}

/** POST said ACCEPTED: toast a verdict that already arrived, else wait for it. */
function awaitVerdict(id: string, label: string) {
  const o = early.get(id);
  if (!o) return void pending.set(id, label);
  early.delete(id);
  toastOutcome(o, label);
}

/** Build -> ed25519 sign with trading key -> POST /orders, errors surfaced as toasts. */
export function usePlaceOrder() {
  const trader = useTrader();
  const tradingKey = useTradingKey(trader);

  return useMutation({
    mutationFn: async (intent: OrderIntent) => {
      if (!trader) throw new Error("Connect a wallet first");
      const key = await tradingKey.ensure();
      const { hashBytes, toRequest } = prepareOrder(intent, { trader, nonce: randomNonce(), nowMs: Date.now() });
      return perpApi.placeOrder(toRequest(key.publicKey, signHash(key, hashBytes)));
    },
    onSuccess: (status, intent) => {
      const label = `${intent.isBuy ? "Long" : "Short"} ${formatSizeRaw(intent.size)} ${intent.market.symbol}`;
      if (status.state === "ORDER_STATE_ACCEPTED") awaitVerdict(status.orderId, label);
      else toastOutcome(status, label);
    },
    onError: (e) => toast.error("Order failed", errorMessage(e)),
  });
}

export function useCancelOrder() {
  const address = useTrader();
  return useMutation({
    mutationFn: (order: Order) => {
      if (!address) throw new Error("Connect a wallet first");
      return perpApi.cancelOrder(order.orderId, address);
    },
    onSuccess: (status) => {
      if (status.state === "ORDER_STATE_CANCEL_REJECTED") toast.error("Cancel rejected", reasonText(status.reason));
      else toast.info("Order cancelled");
    },
    onError: (e) => toast.error("Cancel failed", errorMessage(e)),
  });
}
