import { describe, expect, test } from "bun:test";
import { getMarket } from "@/shared/config/markets";
import { roundToStep } from "@/shared/lib/units";
import { previewOrder, type OrderFormValues, type PreviewContext } from "./order-preview";

const btc = getMarket("BTC")!;
const ctx = { market: btc, mark: 100_000_000_000n, available: 10n ** 12n, collateral: 10n ** 12n, position: { size: 0n, entryNotional: 0n } };
const form = (v: Partial<OrderFormValues>): OrderFormValues => ({
  isBuy: true, kind: "market", price: "", size: "", sizeUnit: "base", leverage: 10, reduceOnly: false, tif: "TIME_IN_FORCE_GTC", ...v,
});

describe("previewOrder size unit", () => {
  test("usdc at mark -> base size", () => {
    const p = previewOrder(form({ sizeUnit: "usdc", size: "1000" }), ctx);
    expect(p.size).toBe(1_000_000n); // 0.01 BTC
    expect(p.notional).toBe(1_000_000_000n);
  });

  test("usdc uses limit price over mark", () => {
    const p = previewOrder(form({ kind: "limit", price: "80000", sizeUnit: "usdc", size: "1000" }), ctx);
    expect(p.size).toBe(roundToStep(1_250_000n, btc.lotSize, "down"));
  });

  test("usdc rounds down to lot", () => {
    const p = previewOrder(form({ sizeUnit: "usdc", size: "1000.99" }), ctx);
    expect(btc.lotSize).toBeGreaterThan(1n);
    expect(p.size).toBe(roundToStep(1_000_990n, btc.lotSize, "down"));
    expect(p.size! % btc.lotSize).toBe(0n);
  });

  test("usdc without any price -> no size", () => {
    expect(previewOrder(form({ sizeUnit: "usdc", size: "1000" }), { ...ctx, mark: null }).size).toBeNull();
  });

  test("base unchanged", () => {
    expect(previewOrder(form({ size: "0.01" }), ctx).size).toBe(1_000_000n);
  });
});

describe("previewOrder liq price", () => {
  // thin collateral so a long has a liq price
  const thin: PreviewContext = { ...ctx, collateral: 200_000_000n };
  const liq = (v: Partial<OrderFormValues>, c = thin) => previewOrder(form(v), c).liqPrice;

  test("ignores leverage and order kind", () => {
    const base = liq({ sizeUnit: "usdc", size: "1000" });
    expect(base).not.toBeNull();
    expect(liq({ sizeUnit: "usdc", size: "1000", leverage: 2 })).toBe(base);
    expect(liq({ sizeUnit: "usdc", size: "1000", kind: "limit", price: "100000" })).toBe(base);
  });

  test("moves with order value and mark", () => {
    const small = liq({ sizeUnit: "usdc", size: "1000" });
    const big = liq({ sizeUnit: "usdc", size: "2000" });
    expect(big!).toBeGreaterThan(small!);
    expect(liq({ size: "0.01" }, { ...thin, mark: 90_000_000_000n })).not.toBe(liq({ size: "0.01" }));
  });

  test("no mark -> none", () => {
    expect(liq({ kind: "limit", price: "100000", size: "0.01" }, { ...thin, mark: null })).toBeNull();
  });
});
