import { cacheLife } from "next/cache";

/**
 * Live Pyth prices. Server-only (imported by app/api/prices): HERMES_API_KEY never reaches the browser.
 */
export const FEEDS = {
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  NEAR: "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750",
} as const;

export type Symbol = keyof typeof FEEDS;
export type LivePrice = { price: number; publishTime: number };
export type LivePrices = Partial<Record<Symbol, LivePrice>>;

type Parsed = { id: string; price: { price: string; expo: number; publish_time: number } };
const NOT_ENTITLED = /Not entitled: feed (?:0x)?([0-9a-f]{64})/i;

/** One Hermes call; drops feeds the key's plan excludes (403 "Not entitled") and retries. */
async function fetchHermes(): Promise<LivePrices> {
  const key = process.env.HERMES_API_KEY;
  if (!key) return {};
  const base = process.env.HERMES_URL ?? "https://hermes.pyth.network";
  let active = Object.entries(FEEDS) as [Symbol, string][];
  while (active.length) {
    const q = new URLSearchParams({ parsed: "true" });
    for (const [, id] of active) q.append("ids[]", id);
    const res = await fetch(`${base}/v2/updates/price/latest?${q}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const body = (await res.json()) as { parsed?: Parsed[] };
      const out: LivePrices = {};
      for (const p of body.parsed ?? []) {
        const sym = active.find(([, id]) => id === p.id.replace(/^0x/, ""))?.[0];
        if (sym) out[sym] = { price: Number(p.price.price) * 10 ** p.price.expo, publishTime: p.price.publish_time };
      }
      return out;
    }
    const m = res.status === 403 ? NOT_ENTITLED.exec(await res.text()) : null;
    const next = m ? active.filter(([, id]) => id !== m[1].toLowerCase()) : active;
    if (next.length === active.length) throw new Error(`hermes: status ${res.status}`);
    active = next;
  }
  return {};
}

/** Cached ~10s across all visitors; failures degrade to {} (UI keeps static fallbacks). */
export async function getLivePrices(): Promise<LivePrices> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 10, expire: 60 });
  try {
    return await fetchHermes();
  } catch (err) {
    console.warn("pyth:", (err as Error).message);
    return {};
  }
}
