import { describe, expect, test } from "bun:test";
import type { BookSnapshot } from "../api/types";
import { aggregateLevels, applyBookUpdate, midPrice } from "./book";

const book: BookSnapshot = {
  market: 0,
  seq: 5,
  bids: [{ price: "990", size: "10" }, { price: "980", size: "5" }],
  asks: [{ price: "1010", size: "3" }, { price: "1020", size: "7" }],
};

describe("book", () => {
  test("applies deltas, removes zero size, keeps order", () => {
    const next = applyBookUpdate(book, {
      market: 0,
      seq: 6,
      deltas: [
        { market: 0, side: "SIDE_BUY", price: "995", size: "1" },
        { market: 0, side: "SIDE_SELL", price: "1010", size: "0" },
      ],
    });
    expect(next.bids.map((l) => l.price)).toEqual(["995", "990", "980"]);
    expect(next.asks.map((l) => l.price)).toEqual(["1020"]);
    expect(next.seq).toBe(6);
  });

  test("snapshot replaces book, same seq ok", () => {
    const next = applyBookUpdate(book, {
      market: 0,
      seq: 5,
      snapshot: true,
      deltas: [{ market: 0, side: "SIDE_BUY", price: "970", size: "2" }],
    });
    expect(next.bids).toEqual([{ price: "970", size: "2" }]);
    expect(next.asks).toEqual([]);
    expect(applyBookUpdate(book, { market: 0, seq: 4, snapshot: true, deltas: [] })).toBe(book);
  });

  test("ignores stale seq + other market", () => {
    expect(applyBookUpdate(book, { market: 0, seq: 5, deltas: [] })).toBe(book);
    expect(applyBookUpdate(book, { market: 1, seq: 9, deltas: [] })).toBe(book);
  });

  test("aggregates with cumulative totals", () => {
    const asks = aggregateLevels(book.asks, 20n, "ask", 5);
    expect(asks).toEqual([{ price: 1020n, size: 10n, total: 10n }]);
    const bids = aggregateLevels(book.bids, 20n, "bid", 5);
    expect(bids).toEqual([{ price: 980n, size: 15n, total: 15n }]);
  });

  test("mid", () => {
    expect(midPrice(book)).toBe(1000n);
  });
});
