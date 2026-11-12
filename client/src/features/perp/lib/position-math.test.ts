import { describe, expect, test } from "bun:test";
import { entryPrice, liquidationPrice, unrealizedPnl } from "./position-math";
import { marketLimitPrice } from "./order-math";

describe("position math", () => {
  test("entry price", () => {
    expect(entryPrice(1_000_000n, 1_000_000_000n)).toBe(100_000_000_000n);
    expect(entryPrice(-1_000_000n, 1_000_000_000n)).toBe(100_000_000_000n);
  });
  test("upnl long/short", () => {
    expect(unrealizedPnl(1_000_000n, 1_000_000_000n, 110_000_000_000n)).toBe(100_000_000n);
    expect(unrealizedPnl(-1_000_000n, 1_000_000_000n, 110_000_000_000n)).toBe(-100_000_000n);
  });
  test("liq price long below entry, short above", () => {
    const long = liquidationPrice({ size: 1_000_000n, entryNotional: 1_000_000_000n, mmrBps: 250, marginBuffer: 100_000_000n });
    const short = liquidationPrice({ size: -1_000_000n, entryNotional: 1_000_000_000n, mmrBps: 250, marginBuffer: 100_000_000n });
    expect(long).toBeCloseTo(92_307.69, 1);
    expect(short).toBeCloseTo(107_317.07, 1);
  });
  test("market limit price is tick aligned + slipped", () => {
    expect(marketLimitPrice(100_000_000_000n, true, 100_000n)).toBe(101_000_000_000n);
    expect(marketLimitPrice(100_000_050_000n, false, 100_000n)).toBe(99_000_000_000n);
  });
});
