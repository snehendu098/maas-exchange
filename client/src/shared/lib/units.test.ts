import { describe, expect, test } from "bun:test";
import {
  decimalsForStep,
  formatUnits,
  parseUnits,
  formatPriceRaw,
  formatRaw,
  formatSizeRaw,
  formatUsdcRaw,
  mulBpsUp,
  notional,
  parsePrice,
  parseSize,
  priceToNumber,
  roundToStep,
  sizeToNumber,
  tryParse,
} from "./units";

describe("price 1e6", () => {
  test("parse", () => {
    expect(parsePrice("100000")).toBe(100_000_000_000n);
    expect(parsePrice("0.000001")).toBe(1n);
    expect(parsePrice("65432.1")).toBe(65_432_100_000n);
  });
  test("format", () => {
    expect(formatPriceRaw(65_432_123_456n)).toBe("65,432.12");
    expect(formatPriceRaw("65432125000")).toBe("65,432.13");
    expect(formatPriceRaw(40_123_000n, 3)).toBe("40.123");
    expect(formatPriceRaw(0n)).toBe("0.00");
    expect(formatPriceRaw(-1_500_000n)).toBe("-1.50");
  });
  test("to number", () => {
    expect(priceToNumber("3500000000")).toBe(3500);
  });
});

describe("size 1e8", () => {
  test("parse", () => {
    expect(parseSize("1")).toBe(100_000_000n);
    expect(parseSize("0.0001")).toBe(10_000n);
  });
  test("format", () => {
    expect(formatSizeRaw(12_345_678n)).toBe("0.1235");
    expect(formatSizeRaw(-250_000_000n, 2)).toBe("-2.50");
    expect(formatSizeRaw(123_456_789_000_000n, 0)).toBe("1,234,568");
  });
  test("to number", () => {
    expect(sizeToNumber(1_000_000n)).toBe(0.01);
  });
});

describe("helpers", () => {
  test("tryParse rejects junk + overlong precision", () => {
    expect(tryParse("", 6)).toBeNull();
    expect(tryParse("1.2.3", 6)).toBeNull();
    expect(tryParse("0.0000001", 6)).toBeNull();
    expect(tryParse("1.5", 6)).toBe(1_500_000n);
  });
  test("decimalsForStep", () => {
    expect(decimalsForStep(100_000n, 6)).toBe(1);
    expect(decimalsForStep(10_000n, 8)).toBe(4);
    expect(decimalsForStep(1_000n, 6)).toBe(3);
  });
  test("notional matches PerpMath", () => {
    // 0.01 BTC @ 100k = 1000 USDC
    expect(notional(1_000_000n, 100_000_000_000n)).toBe(1_000_000_000n);
    expect(notional(-1_000_000n, 100_000_000_000n)).toBe(1_000_000_000n);
    expect(formatUsdcRaw(notional(3n, 1n))).toBe("0.00");
  });
  test("mulBpsUp ceils", () => {
    expect(mulBpsUp(1_000_000_000n, 5)).toBe(500_000n);
    expect(mulBpsUp(1n, 5)).toBe(1n);
    expect(mulBpsUp(0n, 5)).toBe(0n);
  });
  test("roundToStep", () => {
    expect(roundToStep(149n, 100n, "down")).toBe(100n);
    expect(roundToStep(101n, 100n, "up")).toBe(200n);
    expect(roundToStep(150n, 100n)).toBe(200n);
    expect(formatRaw(roundToStep(65_432_150_000n, 100_000n), 6, 1)).toBe("65,432.2");
  });
});

describe("parseUnits / formatUnits", () => {
  test("round trip", () => {
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parseUnits("-0.000001", 6)).toBe(-1n);
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits(-1n, 6)).toBe("-0.000001");
    expect(formatUnits(2_000_000n, 6)).toBe("2");
  });
  test("rejects junk", () => {
    expect(() => parseUnits("1e5", 6)).toThrow();
  });
});
