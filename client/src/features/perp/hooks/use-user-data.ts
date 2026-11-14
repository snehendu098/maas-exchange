"use client";

import { useWallet } from "@/features/wallet/hooks/use-wallet";
import { perpApi } from "../api/client";
import type { Account, FundingPayment, Order, Position, UserEvent, UserFill } from "../api/types";
import { perpKeys } from "./query-keys";
import { useLiveQuery } from "./use-live-query";

const HISTORY = 100;
const OPEN_STATES = new Set<Order["state"]>(["ORDER_STATE_ACCEPTED", "ORDER_STATE_RESTING", "ORDER_STATE_PARTIALLY_FILLED"]);

const reduceAccount = (prev: Account, e: UserEvent) => (e.type === "account" ? e.account : prev);

const reducePositions = (prev: Position[], e: UserEvent) => {
  if (e.type !== "position") return prev;
  const rest = prev.filter((p) => p.market !== e.position.market);
  return BigInt(e.position.size) === 0n ? rest : [...rest, e.position].sort((a, b) => a.market - b.market);
};

const reduceOrders = (prev: Order[], e: UserEvent) => {
  if (e.type !== "order") return prev;
  const rest = prev.filter((o) => o.orderId !== e.order.orderId);
  return OPEN_STATES.has(e.order.state) ? [e.order, ...rest] : rest;
};

const reduceFills = (prev: UserFill[], e: UserEvent) =>
  e.type === "fill" && !prev.some((f) => f.tradeId === e.fill.tradeId) ? [e.fill, ...prev].slice(0, HISTORY) : prev;

const reduceFunding = (prev: FundingPayment[], e: UserEvent) =>
  e.type === "funding" ? [e.payment, ...prev].slice(0, HISTORY) : prev;

function useUserQuery<T>(
  trader: string | undefined,
  queryKey: readonly unknown[],
  fetch: (t: string) => Promise<T>,
  reduce: (prev: T, e: UserEvent) => T,
  refetchInterval?: number,
) {
  return useLiveQuery({
    queryKey,
    queryFn: () => (trader ? fetch(trader) : Promise.reject(new Error("no wallet"))),
    subscription: trader ? { channel: "user", trader } : null,
    reduce,
    enabled: Boolean(trader),
    refetchInterval,
  });
}

export function useTrader() {
  return useWallet().accountId;
}

export const usePerpAccount = (t?: string) => useUserQuery(t, perpKeys.account(t), perpApi.getAccount, reduceAccount);
export const usePositions = (t?: string) => useUserQuery(t, perpKeys.positions(t), perpApi.getPositions, reducePositions);
export const useOpenOrders = (t?: string) => useUserQuery(t, perpKeys.orders(t), perpApi.getOrders, reduceOrders);
export const useFills = (t?: string) => useUserQuery(t, perpKeys.fills(t), perpApi.getFills, reduceFills);
export const useFunding = (t?: string) => useUserQuery(t, perpKeys.funding(t), perpApi.getFunding, reduceFunding, 60_000);
