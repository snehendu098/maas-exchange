import { describe, expect, test } from "bun:test";
import { fundingSeries } from "./chart-data";

describe("chart data", () => {
  test("funding: percent per market, sorted, dup ts keeps last", () => {
    const s = fundingSeries([
      { key: "0-2", market: "BTC", ts: 2, rate: 10n ** 14n },
      { key: "0-1", market: "BTC", ts: 1, rate: 0n },
    ]);
    expect(s.get("BTC")).toEqual([{ time: 1, value: 0 }, { time: 2, value: 0.01 }]);
  });
});
