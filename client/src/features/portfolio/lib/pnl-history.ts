import { notional, usdcToNumber } from "@/shared/lib/units";
import type { SeriesPoint } from "@/shared/lib/chart/svg-chart";
import type { FundingPayment, UserFill } from "@/features/perp/api/types";

export type PnlRange = "1h" | "24h" | "7d" | "30d" | "all";

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/** lookback + bar width per range; "all" starts at the first event's day */
const RANGES: Record<PnlRange, { span: number; bucket: number }> = {
  "1h": { span: HOUR_MS, bucket: 5 * MIN_MS },
  "24h": { span: DAY_MS, bucket: HOUR_MS },
  "7d": { span: 7 * DAY_MS, bucket: DAY_MS },
  "30d": { span: 30 * DAY_MS, bucket: DAY_MS },
  all: { span: 0, bucket: DAY_MS },
};
const point = (ms: number, raw: bigint): SeriesPoint => ({ time: Math.floor(ms / 1000), value: usdcToNumber(raw) });

/** one signed pnl delta, USDC 1e6 */
export interface PnlEvent {
  /** unix ms */
  time: number;
  amount: bigint;
}

/** booked pnl net of fees: realized - fee */
const fillNet = (f: UserFill) => BigInt(f.realizedPnl) - BigInt(f.fee);

/** payment > 0 = paid by trader, so pnl is its negation */
export const fundingPaid = (p: FundingPayment) => BigInt(p.payment ?? p.amount ?? "0");

/** Fills (realized - fee) + funding (-paid) as dated pnl deltas; undated funding is dropped. */
export function pnlEvents(fills: readonly UserFill[], funding: readonly FundingPayment[]): PnlEvent[] {
  const events = fills.map((f) => ({ time: f.time, amount: fillNet(f) }));
  for (const p of funding) if (p.time !== undefined) events.push({ time: p.time, amount: -fundingPaid(p) });
  return events.sort((a, b) => a.time - b.time);
}

// first bucket start; "all" = first event's bucket, at least one bucket back
function rangeStart(events: readonly PnlEvent[], range: PnlRange, now: number) {
  const { span, bucket } = RANGES[range];
  const current = Math.floor(now / bucket) * bucket;
  if (range !== "all") return current - span;
  const first = events.length ? Math.floor(events[0].time / bucket) * bucket : current;
  return Math.min(first, current - bucket);
}

/** Booked pnl at each bucket close across the range; the current bucket adds `unrealized`, so it ends at net pnl. */
export function pnlBuckets(events: readonly PnlEvent[], range: PnlRange, unrealized = 0n, now = Date.now()): SeriesPoint[] {
  const { bucket } = RANGES[range];
  const current = Math.floor(now / bucket) * bucket;
  const points: SeriesPoint[] = [];
  let total = 0n;
  let i = 0;
  for (let t = rangeStart(events, range, now); t <= current; t += bucket) {
    const close = Math.min(t + bucket, now + 1);
    while (i < events.length && events[i].time < close) total += events[i++].amount;
    points.push(point(t, t === current ? total + unrealized : total));
  }
  return points;
}

/** Cumulative pnl at each event's exact time, then now (+unrealized). Starts just before the first trade unless pnl predates the range. */
export function pnlTimeline(events: readonly PnlEvent[], range: PnlRange, unrealized = 0n, now = Date.now()): SeriesPoint[] {
  const start = rangeStart(events, range, now);
  let total = 0n;
  let i = 0;
  while (i < events.length && events[i].time < start) total += events[i++].amount;
  const inRange = events.slice(i).filter((e) => e.time <= now);
  // no prior pnl: skip the empty lead-in, keep a little runway before the first trade
  const first = inRange[0]?.time;
  const runway = Math.max(Math.min(HOUR_MS, RANGES[range].bucket), (now - (first ?? now)) * 0.1);
  const lead = total !== 0n || first === undefined ? start : Math.max(start, first - runway);
  const points = [point(lead, total)];
  for (const e of inRange) points.push(point(e.time, (total += e.amount)));
  points.push(point(now, total + unrealized));
  return points;
}

/** Per-bucket net pnl change across the range (bars); sums to the range's change. */
export function pnlBucketChange(events: readonly PnlEvent[], range: PnlRange, unrealized = 0n, now = Date.now()): SeriesPoint[] {
  const start = rangeStart(events, range, now);
  const base = usdcToNumber(events.filter((e) => e.time < start).reduce((a, e) => a + e.amount, 0n));
  return pnlBuckets(events, range, unrealized, now).map((p, i, all) => ({ time: p.time, value: p.value - (i ? all[i - 1].value : base) }));
}

export interface TradeOutcome {
  market: number;
  /** USD */
  pnl: number;
  /** percent of closed notional */
  returnPct: number;
}

/** Fills that closed size; pnl is net of the fill's fee, so a fee-only scratch is a loss. */
export function tradeOutcomes(fills: UserFill[]): TradeOutcome[] {
  return fills
    .filter((f) => BigInt(f.realizedPnl) !== 0n)
    .map((f) => {
      const pnl = usdcToNumber(fillNet(f));
      const closed = usdcToNumber(notional(f.size, f.price));
      return { market: f.market, pnl, returnPct: closed > 0 ? (pnl / closed) * 100 : 0 };
    });
}

export interface OutcomeSummary {
  /** percent, null when nothing closed */
  winRate: number | null;
  biggestWin: TradeOutcome | null;
  biggestLoss: TradeOutcome | null;
}

export function summarizeOutcomes(outcomes: TradeOutcome[]): OutcomeSummary {
  const wins = outcomes.filter((o) => o.pnl > 0);
  const losses = outcomes.filter((o) => o.pnl < 0);
  const pick = (list: TradeOutcome[], better: (a: TradeOutcome, b: TradeOutcome) => boolean) =>
    list.reduce<TradeOutcome | null>((best, o) => (best === null || better(o, best) ? o : best), null);
  return {
    winRate: outcomes.length ? (wins.length / outcomes.length) * 100 : null,
    biggestWin: pick(wins, (a, b) => a.pnl > b.pnl),
    biggestLoss: pick(losses, (a, b) => a.pnl < b.pnl),
  };
}

export interface ReturnBand {
  label: string;
  tone: "up" | "down";
  count: number;
  /** 0..1 */
  share: number;
}

const BANDS: ReadonlyArray<{ label: string; tone: "up" | "down"; test: (r: number) => boolean }> = [
  { label: "> +5%", tone: "up", test: (r) => r > 5 },
  { label: "0% to +5%", tone: "up", test: (r) => r >= 0 && r <= 5 },
  { label: "-5% to 0%", tone: "down", test: (r) => r < 0 && r >= -5 },
  { label: "< -5%", tone: "down", test: (r) => r < -5 },
];

/** Closed trades by return band; empty when nothing closed. */
export function returnBands(outcomes: TradeOutcome[]): ReturnBand[] {
  if (!outcomes.length) return [];
  return BANDS.map(({ label, tone, test }) => {
    const count = outcomes.filter((o) => test(o.returnPct)).length;
    return { label, tone, count, share: count / outcomes.length };
  });
}
