"use client";

import { useState } from "react";
import type { MarketConfig } from "@/shared/config/markets";
import { PRICE_DECIMALS, SIZE_DECIMALS, formatRaw, formatUsdcRaw, notional, roundToStep } from "@/shared/lib/units";
import { sizeFromMargin } from "../lib/order-math";
import { previewOrder, type OrderFormValues } from "../lib/order-preview";
import { midPrice } from "../lib/book";
import { fmtSize, priceDecimals, sizeDecimals } from "../lib/market-format";
import { useMarketStat, useOrderBookSnapshot } from "./use-market-data";
import { usePlaceOrder } from "./use-order-actions";
import { usePerpAccount, usePositions, useTrader } from "./use-user-data";

const sizeInput = (raw: bigint, m: MarketConfig) => (raw > 0n ? formatRaw(raw, SIZE_DECIMALS, sizeDecimals(m)).replaceAll(",", "") : "");
/** USDC 1e6 -> cents input string */
const usdcInput = (raw: bigint, mode: "up" | "down") => {
  const cents = roundToStep(raw, 10_000n, mode);
  return cents > 0n ? formatUsdcRaw(cents).replaceAll(",", "") : "";
};

const initial = (m: MarketConfig): OrderFormValues => ({
  isBuy: true,
  kind: "market",
  price: "",
  size: "",
  sizeUnit: "base",
  leverage: Math.min(10, m.maxLeverage),
  reduceOnly: false,
  tif: "TIME_IN_FORCE_GTC",
});

/** Order ticket state, preview and submit for one market. */
export function useOrderForm(market: MarketConfig) {
  const [values, setValues] = useState<OrderFormValues>(() => initial(market));
  const trader = useTrader();
  const stats = useMarketStat(market.id);
  const account = usePerpAccount(trader).data;
  const positions = usePositions(trader).data;
  const place = usePlaceOrder();
  const book = useOrderBookSnapshot(market.id).data;

  const pos = positions?.find((p) => p.market === market.id);
  const mark = stats ? BigInt(stats.markPrice) : null;
  const equity = account ? BigInt(account.equity) : 0n;
  const im = account ? BigInt(account.initialMargin) : 0n;
  const available = equity > im ? equity - im : 0n;

  const preview = previewOrder(values, {
    market,
    mark,
    available,
    collateral: account ? BigInt(account.collateral) : 0n,
    position: { size: pos ? BigInt(pos.size) : 0n, entryNotional: pos ? BigInt(pos.entryNotional) : 0n },
  });

  const set = <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // limit price if set, else mark
  const ref = preview.price ?? mark;
  const usdcMode = values.sizeUnit === "usdc";

  const setFraction = (fraction: number) => {
    if (!ref) return;
    const budget = (available * BigInt(Math.round(fraction * 1000))) / 1000n;
    if (usdcMode) return set("size", usdcInput((budget * BigInt(Math.floor(values.leverage * 100))) / 100n, "down"));
    set("size", sizeInput(sizeFromMargin(budget, values.leverage, ref, market), market));
  };

  // cents rounded up so base -> usdc -> base keeps the same lot count
  const toggleUnit = () => {
    const s = preview.size && ref ? (usdcMode ? sizeInput(preview.size, market) : usdcInput(notional(preview.size, ref), "up")) : "";
    setValues((v) => ({ ...v, sizeUnit: usdcMode ? "base" : "usdc", size: s }));
  };

  // book mid snapped to tick, passive side (buy down, sell up)
  const mid = book ? midPrice(book) : null;
  const fillMid = mid
    ? () => set("price", formatRaw(roundToStep(mid, market.tickSize, values.isBuy ? "down" : "up"), PRICE_DECIMALS, priceDecimals(market)).replaceAll(",", ""))
    : undefined;

  // ticket margin as % of available, drives the % slider
  const percent = available > 0n ? Math.min(100, Math.round(Number((preview.margin * 100n) / available))) : 0;

  const counterpart =
    preview.size && ref
      ? usdcMode
        ? `≈ ${fmtSize(preview.size, market)} ${market.symbol}`
        : `≈ $${formatUsdcRaw(notional(preview.size, ref))}`
      : null;

  const submit = async () => {
    if (preview.error || !preview.size) return;
    // errors toasted by usePlaceOrder
    const ok = await place.mutateAsync({
      market,
      isBuy: values.isBuy,
      kind: values.kind,
      price: preview.price ?? undefined,
      markPrice: mark ?? undefined,
      size: preview.size,
      reduceOnly: values.reduceOnly,
      tif: values.tif,
    }).catch(() => null);
    if (ok && ok.state !== "ORDER_STATE_REJECTED") setValues((v) => ({ ...v, size: "" }));
  };

  return { values, set, mark, setFraction, toggleUnit, counterpart, fillMid, percent, position: pos ? BigInt(pos.size) : 0n, preview, available, account, isConnected: Boolean(trader), submit, isSubmitting: place.isPending };
}
