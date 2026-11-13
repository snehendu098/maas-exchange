import { describe, expect, test } from "bun:test";
import { liveRefPrice } from "./live-price";

describe("liveRefPrice", () => {
  test("live usd -> 1e6 raw", () => {
    expect(liveRefPrice({ BTC: 101_234.5 }, "BTC", 1n)).toBe(101_234_500_000n);
  });

  test("missing or dust -> fallback", () => {
    expect(liveRefPrice({ BTC: 1 }, "ETH", 7n)).toBe(7n);
    expect(liveRefPrice({ ETH: 1e-9 }, "ETH", 7n)).toBe(7n);
  });
});
