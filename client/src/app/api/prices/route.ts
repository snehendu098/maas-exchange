import { cacheLife } from "next/cache";
import { MARKETS } from "@/shared/config/markets";

/** `{ [symbol]: { price, publishTime } }`; symbols Hermes can't serve are omitted. */
export type PricesResponse = Record<string, { price: number; publishTime: number }>;

interface ParsedFeed {
  id: string;
  price: { price: string; expo: number; publish_time: number };
}

const hex = (id: string) => id.toLowerCase().replace(/^0x/, "");

export async function GET() {
  return Response.json(await latestPrices());
}

// key stays server-side; never throws so the client falls back to static refPrice
async function latestPrices(): Promise<PricesResponse> {
  "use cache";
  cacheLife({ stale: 10, revalidate: 10, expire: 60 });

  const key = process.env.HERMES_API_KEY;
  if (!key) return {};
  const base = process.env.HERMES_URL ?? "https://hermes.pyth.network";
  let feeds = MARKETS.map((m) => ({ symbol: m.symbol, id: hex(m.feedId) }));

  while (feeds.length > 0) {
    const qs = feeds.map((f) => `ids[]=${f.id}`).join("&");
    try {
      const res = await fetch(`${base}/v2/updates/price/latest?parsed=true&${qs}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 403) {
        // plan lacks a feed: "Not entitled: feed <hex>" -> drop it, retry rest
        const denied = /feed\s+(?:0x)?([0-9a-f]{64})/i.exec(await res.text())?.[1]?.toLowerCase();
        const rest = feeds.filter((f) => f.id !== denied);
        if (rest.length === feeds.length) return {};
        feeds = rest;
        continue;
      }
      if (!res.ok) return {};
      const { parsed = [] } = (await res.json()) as { parsed?: ParsedFeed[] };
      const out: PricesResponse = {};
      for (const p of parsed) {
        const feed = feeds.find((f) => f.id === hex(p.id));
        const price = Number(p.price.price) * 10 ** p.price.expo;
        if (feed && Number.isFinite(price) && price > 0) out[feed.symbol] = { price, publishTime: p.price.publish_time };
      }
      return out;
    } catch {
      return {};
    }
  }
  return {};
}
