import type { MarketSymbol } from "@/shared/config/markets";

/** USD by symbol; a missing symbol = no live price (callers keep static refPrice). */
export type LivePrices = Partial<Record<MarketSymbol, number>>;

/** /api/prices caches ~10s server side; poll at the same pace. */
export const LIVE_POLL_MS = 10_000;
const TIMEOUT_MS = 2_500;

/** /api/prices body -> positive finite prices only. */
export function parsePrices(body: unknown): LivePrices {
  const out: LivePrices = {};
  if (!body || typeof body !== "object") return out;
  for (const [symbol, row] of Object.entries(body as Record<string, { price?: unknown }>)) {
    const price = row?.price;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) out[symbol as MarketSymbol] = price;
  }
  return out;
}

/** One fetch of Pyth prices via /api/prices; {} on server, offline or error. */
export async function fetchLivePrices(): Promise<LivePrices> {
  if (typeof window === "undefined") return {};
  try {
    const res = await fetch("/api/prices", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? parsePrices(await res.json()) : {};
  } catch {
    return {};
  }
}

export interface LiveFeed {
  /** last good prices; {} until the first fetch lands */
  latest(): LivePrices;
  /** true once any symbol came back live */
  isLive(): boolean;
  /** polls only while someone listens; returns unsubscribe */
  subscribe(listener: (prices: LivePrices) => void): () => void;
}

/** Shared poller: one loop per tab however many sims listen. Failed polls keep the last prices. */
export function createLiveFeed(fetcher: () => Promise<LivePrices>, intervalMs = LIVE_POLL_MS): LiveFeed {
  let prices: LivePrices = {};
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(p: LivePrices) => void>();

  const poll = async () => {
    const next = await fetcher();
    if (Object.keys(next).length === 0) return;
    prices = { ...prices, ...next };
    for (const l of listeners) l(prices);
  };

  return {
    latest: () => prices,
    isLive: () => Object.keys(prices).length > 0,
    subscribe(listener) {
      listeners.add(listener);
      if (!timer) {
        void poll();
        timer = setInterval(() => void poll(), intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
  };
}

/** App-wide feed over /api/prices. */
export const livePrices = createLiveFeed(fetchLivePrices);
