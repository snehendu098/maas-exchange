import type { BookLevel, BookSnapshot, BookUpdate } from "../api/types";

const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

/** Applies deltas in seq order; snapshot replaces; stale or foreign updates ignored. */
export function applyBookUpdate(book: BookSnapshot, update: BookUpdate): BookSnapshot {
  if (update.market !== book.market) return book;
  if (update.snapshot ? update.seq < book.seq : update.seq <= book.seq) return book;
  const bids = new Map(update.snapshot ? [] : book.bids.map((l) => [l.price, l.size]));
  const asks = new Map(update.snapshot ? [] : book.asks.map((l) => [l.price, l.size]));
  for (const d of update.deltas) {
    const side = d.side === "SIDE_BUY" ? bids : asks;
    if (BigInt(d.size) === 0n) side.delete(d.price);
    else side.set(d.price, d.size);
  }
  const sorted = (m: Map<string, string>, desc: boolean): BookLevel[] =>
    [...m.entries()]
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => (desc ? cmp(BigInt(b.price), BigInt(a.price)) : cmp(BigInt(a.price), BigInt(b.price))));
  return { ...book, seq: update.seq, bids: sorted(bids, true), asks: sorted(asks, false) };
}

export interface DepthLevel {
  price: bigint;
  size: bigint;
  /** cumulative from spread */
  total: bigint;
}

/** Buckets levels by `group` (asks round up, bids down), best first, with totals. */
export function aggregateLevels(levels: BookLevel[], group: bigint, side: "bid" | "ask", count: number): DepthLevel[] {
  const buckets = new Map<bigint, bigint>();
  for (const l of levels) {
    const p = BigInt(l.price);
    const r = p % group;
    const bucket = r === 0n ? p : side === "ask" ? p - r + group : p - r;
    buckets.set(bucket, (buckets.get(bucket) ?? 0n) + BigInt(l.size));
  }
  let total = 0n;
  return [...buckets.entries()]
    .sort(([a], [b]) => (side === "ask" ? cmp(a, b) : cmp(b, a)))
    .slice(0, count)
    .map(([price, size]) => {
      total += size;
      return { price, size, total };
    });
}

export function midPrice(book: BookSnapshot): bigint | null {
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (!bid || !ask) return null;
  return (BigInt(bid.price) + BigInt(ask.price)) / 2n;
}
