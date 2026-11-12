import { describe, expect, test } from "bun:test";
import type { PublicTrade } from "../api/types";
import { mergeTradeIntoCandles } from "./candles";

const trade = (time: number, price: string, size = "1") => ({ time, price, size }) as PublicTrade;

describe("mergeTradeIntoCandles", () => {
  test("first print opens a bar, same bucket folds, next bucket opens at prev close", () => {
    let c = mergeTradeIntoCandles([], trade(61_000, "10"), "1m");
    expect(c).toEqual([{ time: 60, open: "10", high: "10", low: "10", close: "10", volume: "1" }]);
    c = mergeTradeIntoCandles(c, trade(90_000, "12", "2"), "1m");
    expect(c[0]).toMatchObject({ high: "12", close: "12", volume: "3" });
    c = mergeTradeIntoCandles(c, trade(125_000, "11"), "1m");
    expect(c[1]).toMatchObject({ time: 120, open: "12", low: "11", close: "11" });
  });
});
