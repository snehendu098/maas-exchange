import { describe, expect, test } from "bun:test";
import type { TraderStats } from "../api/types";
import { rankTraders, searchTraders, sortTraders, summarize } from "./ranking";

const t = (address: string, pnl: number, roi: number, markets: TraderStats["markets"] = ["BTC"]): TraderStats => ({
  address: address as TraderStats["address"],
  pnl,
  roi,
  volume: 100,
  winRate: 50,
  trades: 1,
  equity: 1_000,
  markets,
  curve: [],
});

const LIST = [t("aa.near", 10, 5), t("bb.near", 50, 1, ["ETH"]), t("cc.near", -5, 20)];

describe("leaderboard ranking", () => {
  test("rank follows pnl", () => {
    expect(rankTraders(LIST).map((r) => [r.address, r.rank])).toEqual([["bb.near", 1], ["aa.near", 2], ["cc.near", 3]]);
  });
  test("sort keeps rank, flips direction", () => {
    const ranked = rankTraders(LIST);
    expect(sortTraders(ranked, { key: "roi", direction: "desc" }).map((r) => r.rank)).toEqual([3, 2, 1]);
    expect(sortTraders(ranked, { key: "roi", direction: "asc" }).map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  test("search by address or market", () => {
    const ranked = rankTraders(LIST);
    expect(searchTraders(ranked, "AA.N").map((r) => r.address)).toEqual(["aa.near"]);
    expect(searchTraders(ranked, "eth").map((r) => r.address)).toEqual(["bb.near"]);
    expect(searchTraders(ranked, " ")).toHaveLength(3);
  });
  test("summary", () => {
    expect(summarize(LIST)).toEqual({ traders: 3, volume: 300, topPnl: 50, profitable: 2 });
  });

});
