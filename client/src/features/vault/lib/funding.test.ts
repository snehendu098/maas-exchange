import { describe, expect, test } from "bun:test";
import type { FundingRecord } from "../api/types";
import { groupByMarket, latestRates, negativeSince, summarizeFunding } from "./funding";

const pct = (p: number) => BigInt(Math.round(p * 1e16));
const print = (ts: number, rate: bigint, market: FundingRecord["market"] = "BTC"): FundingRecord => ({
  key: `${market}-${ts}`,
  market,
  ts,
  rate,
});
const series = (rates: number[]) => rates.map((r, i) => print(i * 3600, pct(r)));

describe("funding helpers", () => {
  test("group + sort per market", () => {
    const g = groupByMarket([print(2, 1n, "ETH"), print(1, 1n, "ETH"), print(1, 1n, "BTC")]);
    expect(g.get("ETH")?.map((p) => p.ts)).toEqual([1, 2]);
    expect(g.get("BTC")?.length).toBe(1);
  });
  test("negativeSince = start of trailing streak", () => {
    expect(negativeSince(series([0.01, -0.01, 0.01, -0.01, -0.02]))).toBe(3 * 3600);
    expect(negativeSince(series([-0.01, 0.01]))).toBeNull();
    expect(negativeSince([])).toBeNull();
  });
  test("summary: latest + streak per market", () => {
    const s = summarizeFunding([print(1, -1n, "NEAR"), print(2, -2n, "NEAR"), print(1, 5n, "BTC")]);
    expect(s.NEAR?.latest?.rate).toBe(-2n);
    expect(s.NEAR?.negativeSince).toBe(1);
    expect(s.BTC?.negativeSince).toBeNull();
    expect(latestRates(s)).toEqual({ NEAR: -2n, BTC: 5n });
  });

});
