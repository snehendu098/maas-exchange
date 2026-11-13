import { describe, expect, test } from "bun:test";
import { formatBpsPercent, formatDuration, formatSharePrice, formatShares, formatUtcStamp } from "./vault-format";

describe("vault format", () => {
  test("shares 6dp", () => {
    expect(formatShares(1_234_567n)).toBe("1.2346");
    expect(formatShares(12_345_678_900n, 2)).toBe("12,345.68");
    expect(formatShares(0n)).toBe("0.0000");
  });
  test("share price", () => {
    expect(formatSharePrice(1_042_311n)).toBe("$1.042311");
  });
  test("bps", () => {
    expect(formatBpsPercent(10)).toBe("0.10%");
    expect(formatBpsPercent(4000)).toBe("40.00%");
  });
  test("duration", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(59)).toBe("0m");
    expect(formatDuration(4500)).toBe("1h 15m");
    expect(formatDuration(200_000)).toBe("2d 7h");
  });
  test("utc stamp", () => {
    expect(formatUtcStamp(Date.UTC(2026, 10, 6, 14, 5) / 1000)).toBe("Nov 06 14:05 UTC");
  });
});
