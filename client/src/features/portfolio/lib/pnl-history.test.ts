import { describe, expect, test } from "bun:test";
import type { FundingPayment, UserFill } from "@/features/perp/api/types";
import { pnlBuckets, pnlBucketChange, pnlEvents, pnlTimeline, returnBands, summarizeOutcomes, tradeOutcomes } from "./pnl-history";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 6, 12);

// 1 unit at $100
const fill = (realizedPnl: string, time = NOW, fee = "0", price = "100000000"): UserFill => ({
  tradeId: "1",
  market: 0,
  orderId: "1",
  side: "SIDE_SELL",
  price,
  size: "100000000",
  fee,
  liquidity: "taker",
  realizedPnl,
  time,
});

const paid = (payment: string, time?: number): FundingPayment => ({ market: 0, payment, time });

describe("pnlEvents", () => {
  test("fills net of fee, funding negated, undated funding dropped, time sorted", () => {
    const events = pnlEvents([fill("5000000", NOW, "1000000")], [paid("2000000", NOW - DAY), paid("-500000", NOW), paid("9", undefined)]);
    expect(events.map((e) => e.amount)).toEqual([-2_000_000n, 4_000_000n, 500_000n]);
  });
});

describe("pnlBuckets", () => {
  test("one point per day, carries prior pnl, today adds unrealized", () => {
    const events = pnlEvents([fill("3000000", NOW - 10 * DAY), fill("5000000", NOW - DAY, "1000000"), fill("-2000000", NOW - 2 * DAY)], []);
    const points = pnlBuckets(events, "7d", 1_500_000n, NOW);
    expect(points).toHaveLength(8);
    expect(points.map((p) => p.value)).toEqual([3, 3, 3, 3, 3, 1, 5, 6.5]);
    expect(points.at(-1)?.time).toBe(Math.floor(NOW / DAY) * 86_400);
  });

  test("all time starts at the first event's day", () => {
    const points = pnlBuckets(pnlEvents([fill("1000000", NOW - 3 * DAY)], []), "all", 0n, NOW);
    expect(points).toHaveLength(4);
    expect(points.map((p) => p.value)).toEqual([1, 1, 1, 1]);
  });

  test("daily change: per-day delta, prior pnl is the base", () => {
    const events = pnlEvents([fill("3000000", NOW - 10 * DAY), fill("5000000", NOW - DAY, "1000000"), fill("-2000000", NOW - 2 * DAY)], []);
    const bars = pnlBucketChange(events, "7d", 1_500_000n, NOW);
    expect(bars.map((p) => p.value)).toEqual([0, 0, 0, 0, 0, -2, 4, 1.5]);
    expect(bars.map((p) => p.time)).toEqual(pnlBuckets(events, "7d", 0n, NOW).map((p) => p.time));
  });

  test("timeline: exact event times, lead-in before first trade, ends at now + unrealized", () => {
    const events = pnlEvents([fill("2000000", NOW - 3 * 3_600_000), fill("-5000000", NOW - 3_600_000)], []);
    const t = pnlTimeline(events, "30d", 1_000_000n, NOW);
    expect(t.map((p) => p.value)).toEqual([0, 2, -3, -2]);
    expect(t[0].time).toBe(Math.floor((NOW - 4 * 3_600_000) / 1000));
    expect(t.at(-1)?.time).toBe(Math.floor(NOW / 1000));
  });

  test("timeline: pnl before the range starts at range start with that base", () => {
    const events = pnlEvents([fill("4000000", NOW - 40 * DAY), fill("1000000", NOW - DAY)], []);
    const t = pnlTimeline(events, "7d", 0n, NOW);
    expect(t.map((p) => p.value)).toEqual([4, 5, 5]);
    expect(t[0].time).toBe((Math.floor(NOW / DAY) * DAY - 7 * DAY) / 1000);
  });

  test("1h range: 5-minute buckets, 24h: hourly", () => {
    const events = pnlEvents([fill("1000000", NOW - 10 * 60_000)], []);
    const hour = pnlBuckets(events, "1h", 0n, NOW);
    expect(hour).toHaveLength(13);
    expect(hour[1].time - hour[0].time).toBe(300);
    expect(pnlBucketChange(events, "1h", 0n, NOW).reduce((a, p) => a + p.value, 0)).toBe(1);
    expect(pnlBuckets(events, "24h", 0n, NOW)).toHaveLength(25);
  });

  test("no events -> flat zero", () => {
    expect(new Set(pnlBuckets([], "30d", 0n, NOW).map((p) => p.value))).toEqual(new Set([0]));
  });
});

describe("outcomes", () => {
  const outcomes = tradeOutcomes([fill("10000000"), fill("-3000000"), fill("0"), fill("2000000")]);

  test("outcome pnl is net of fee: fee-only scratch counts as a loss", () => {
    expect(tradeOutcomes([fill("100000", NOW, "300000")])[0].pnl).toBeCloseTo(-0.2);
  });

  test("skips opening fills, return is pnl over closed notional", () => {
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0].returnPct).toBe(10);
  });

  test("summary picks extremes and win rate", () => {
    const s = summarizeOutcomes(outcomes);
    expect(s.winRate).toBeCloseTo(66.67, 1);
    expect(s.biggestWin?.pnl).toBe(10);
    expect(s.biggestLoss?.pnl).toBe(-3);
    expect(summarizeOutcomes([]).winRate).toBeNull();
  });

  test("bands share sums to one", () => {
    const bands = returnBands(outcomes);
    expect(bands.map((b) => b.count)).toEqual([1, 1, 1, 0]);
    expect(bands.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1);
    expect(returnBands([])).toEqual([]);
  });
});
