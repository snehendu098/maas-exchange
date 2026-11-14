import { describe, expect, test } from "bun:test";
import { getMarket } from "@/shared/config/markets";
import { prepareOrder, stateText } from "./order-request";

const btc = getMarket("BTC")!;
const ctx = {
  trader: "bob.near",
  nonce: 42n,
  nowMs: 1_900_000_000_000 - 30 * 24 * 3600 * 1000,
} as const;

describe("prepareOrder", () => {
  test("limit buy -> hash + request", () => {
    const { orderHash, toRequest } = prepareOrder(
      { market: btc, isBuy: true, kind: "limit", price: 100_000_000_000n, size: 1_000_000n, reduceOnly: false, tif: "TIME_IN_FORCE_GTC" },
      ctx,
    );
    expect(orderHash).toMatch(/^[0-9a-f]{64}$/);
    const req = toRequest("ed25519:k", "sig");
    expect(req).toMatchObject({ side: "SIDE_BUY", type: "ORDER_TYPE_LIMIT", tif: "TIME_IN_FORCE_GTC", expiryMs: "1900000000000", orderHash, publicKey: "ed25519:k" });
  });

  test("market sell -> IOC with slipped limit", () => {
    const { fields, toRequest } = prepareOrder(
      { market: btc, isBuy: false, kind: "market", markPrice: 100_000_000_000n, size: 1_000_000n, reduceOnly: true, tif: "TIME_IN_FORCE_GTC" },
      ctx,
    );
    expect(fields.price).toBe(99_000_000_000n);
    expect(toRequest("ed25519:k", "sig")).toMatchObject({ tif: "TIME_IN_FORCE_IOC", reduceOnly: true, type: "ORDER_TYPE_MARKET" });
  });

  test("post-only limit", () => {
    const { toRequest } = prepareOrder(
      { market: btc, isBuy: true, kind: "limit", price: 1n, size: 1n, reduceOnly: false, tif: "TIME_IN_FORCE_POST_ONLY" },
      ctx,
    );
    expect(toRequest("ed25519:k", "sig").tif).toBe("TIME_IN_FORCE_POST_ONLY");
  });
});

describe("stateText", () => {
  test("accepted / resting read as open, part-filled rest as partial", () => {
    expect(stateText({ state: "ORDER_STATE_ACCEPTED", filled: "0" })).toBe("open");
    expect(stateText({ state: "ORDER_STATE_RESTING", filled: "0" })).toBe("open");
    expect(stateText({ state: "ORDER_STATE_RESTING", filled: "5" })).toBe("partially filled");
    expect(stateText({ state: "ORDER_STATE_PARTIALLY_FILLED", filled: "5" })).toBe("partially filled");
    expect(stateText({ state: "ORDER_STATE_FILLED", filled: "5" })).toBe("filled");
  });
});
