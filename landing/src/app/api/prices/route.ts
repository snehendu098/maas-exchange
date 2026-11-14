import { getLivePrices } from "@/lib/pyth";

/** GET /api/prices → { BTC: { price, publishTime }, ... } from Pyth (cached ~10s, key server-side). */
export async function GET() {
  return Response.json(await getLivePrices());
}
