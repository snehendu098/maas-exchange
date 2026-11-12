/** Demo content: delta-neutral USDC vault (spot + equal perp short), 0 vault fees, FLAT on negative funding. */

export type HeroSlide = {
  title: string;
  statLabel: string;
  statValue: string;
  timerLabel: string;
  endsIn: number; // seconds
  gaugeValue: string;
  gaugeLabel: string;
  gaugePct: number; // 0..100 arc fill
  seed: number;
  start: string; // dd/mm/yy of first chart column
  /** [t (0..1), value %] keyframes for the bar chart (funding APR / signal) */
  curve: [number, number][];
};

export type MarketCard = {
  tag: string;
  badge: { kind: "countdown"; seconds: number } | { kind: "text"; text: string };
  title: string;
  leftLabel: string;
  rightLabel: string;
  left: number; // % share of left side
  delta: number;
  leftCount: string;
  rightCount: string;
  leftCta: string;
  rightCta: string;
  /** Button prices = live Pyth mid (via /api/prices) ± bps; `fallback` mid when offline. */
  quote: { symbol: "BTC" | "ETH" | "NEAR"; leftBps: number; rightBps: number; fallback: number };
  seed: number;
};

export const heroSlides: HeroSlide[] = [
  {
    title: "Earn ETH funding.",
    statLabel: "Vault TVL:",
    statValue: "$312,840",
    timerLabel: "Next funding in",
    endsIn: 40 * 60 + 24,
    gaugeValue: "18.4%",
    gaugeLabel: "Net APR",
    gaugePct: 58,
    seed: 11,
    start: "01/11/26",
    curve: [
      [0, 40], [0.1, 41], [0.2, 45], [0.3, 46], [0.38, 48], [0.4, 54],
      [0.43, 47], [0.48, 37], [0.55, 36], [0.62, 37], [0.68, 42], [0.74, 48],
      [0.8, 56], [0.86, 66], [0.9, 75], [0.95, 84], [1, 86],
    ],
  },
  {
    title: "Zero vault fees.",
    statLabel: "Fees saved:",
    statValue: "$4,912",
    timerLabel: "Next rebalance in",
    endsIn: 2 * 3600 + 12 * 60 + 9,
    gaugeValue: "0.00%",
    gaugeLabel: "Vault fee · spot & perp",
    gaugePct: 100,
    seed: 23,
    start: "28/10/26",
    curve: [[0, 30], [0.2, 36], [0.35, 44], [0.5, 49], [0.65, 58], [0.8, 66], [0.9, 72], [1, 80]],
  },
  {
    title: "Auto FLAT mode.",
    statLabel: "Mode:",
    statValue: "HEDGED",
    timerLabel: "Keeper check in",
    endsIn: 4 * 60 + 41,
    gaugeValue: "1/3",
    gaugeLabel: "Negative periods to exit",
    gaugePct: 33,
    seed: 37,
    start: "20/10/26",
    curve: [[0, 62], [0.2, 58], [0.4, 41], [0.55, 22], [0.7, 18], [0.85, 35], [1, 52]],
  },
  {
    title: "ETH-PERP CLOB.",
    statLabel: "24h volume:",
    statValue: "$1,284,330",
    timerLabel: "Next batch settle",
    endsIn: 18 * 60 + 52,
    gaugeValue: "0.012%",
    gaugeLabel: "Funding / 1h",
    gaugePct: 46,
    seed: 41,
    start: "03/11/26",
    curve: [[0, 22], [0.25, 28], [0.45, 40], [0.6, 62], [0.72, 55], [0.85, 49], [1, 58]],
  },
  {
    title: "Ref Finance spot leg.",
    statLabel: "Spot held:",
    statValue: "$540,200",
    timerLabel: "Next swap check",
    endsIn: 3600 + 7 * 60 + 18,
    gaugeValue: "0.30%",
    gaugeLabel: "Swap fee · vault perps pay 0",
    gaugePct: 30,
    seed: 53,
    start: "05/11/26",
    curve: [[0, 50], [0.2, 47], [0.4, 55], [0.55, 49], [0.7, 58], [0.85, 61], [1, 63]],
  },
  {
    title: "Keeper rebalancer.",
    statLabel: "Decisions:",
    statValue: "27",
    timerLabel: "Next cron in",
    endsIn: 52 * 60 + 3,
    gaugeValue: "2/3",
    gaugeLabel: "Positive periods to re-enter",
    gaugePct: 67,
    seed: 67,
    start: "15/10/26",
    curve: [[0, 45], [0.2, 41], [0.4, 30], [0.6, 26], [0.75, 44], [0.9, 61], [1, 70]],
  },
  {
    title: "Settled on NEAR.",
    statLabel: "Events:",
    statValue: "1,214",
    timerLabel: "Next snapshot in",
    endsIn: 23 * 60 + 59,
    gaugeValue: "100%",
    gaugeLabel: "Fills settled onchain",
    gaugePct: 100,
    seed: 79,
    start: "22/10/26",
    curve: [[0, 35], [0.15, 38], [0.3, 44], [0.5, 47], [0.65, 59], [0.8, 54], [1, 52]],
  },
  {
    title: "Delta ≈ 0.",
    statLabel: "Spot / short:",
    statValue: "42.1 / −42.1 ETH",
    timerLabel: "Drift check in",
    endsIn: 9 * 60 + 30,
    gaugeValue: "0.2%",
    gaugeLabel: "Delta drift",
    gaugePct: 4,
    seed: 97,
    start: "10/10/26",
    curve: [[0, 34], [0.2, 36], [0.4, 33], [0.6, 35], [0.8, 34], [1, 35]],
  },
];

export const marketCards: MarketCard[] = [
  {
    tag: "Perp",
    badge: { kind: "countdown", seconds: 84 },
    title: "ETH-PERP · offchain book, onchain settle",
    leftLabel: "Long",
    rightLabel: "Short",
    left: 68,
    delta: 2.7,
    leftCount: "2,184 Longs",
    rightCount: "1,026 Shorts",
    leftCta: "Long",
    rightCta: "Short",
    quote: { symbol: "ETH", leftBps: 5, rightBps: -5, fallback: 2229 }, // ask/bid: mm-bot half-spread (MM_SPREAD_BPS=10)
    seed: 5,
  },
  {
    tag: "Perp",
    badge: { kind: "text", text: "up to 10x" },
    title: "NEAR-PERP · offchain book, onchain settle",
    leftLabel: "Long",
    rightLabel: "Short",
    left: 61,
    delta: 3.4,
    leftCount: "1,963 Longs",
    rightCount: "1,242 Shorts",
    leftCta: "Long",
    rightCta: "Short",
    quote: { symbol: "NEAR", leftBps: 5, rightBps: -5, fallback: 3 },
    seed: 9,
  },
];

/** Piecewise-linear sample of a keyframe curve at t∈[0,1]. */
export function sampleCurve(curve: [number, number][], t: number) {
  for (let i = 1; i < curve.length; i++) {
    const [t1, v1] = curve[i];
    if (t <= t1) {
      const [t0, v0] = curve[i - 1];
      const k = (t - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * k;
    }
  }
  return curve[curve.length - 1][1];
}

export function addDays(ddmmyy: string, days: number) {
  const [d, m, y] = ddmmyy.split("/").map(Number);
  const date = new Date(Date.UTC(2000 + y, m - 1, d + days));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}/${p(date.getUTCFullYear() % 100)}`;
}
