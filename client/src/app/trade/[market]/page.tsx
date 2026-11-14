import type { Metadata } from "next";
import { pageMetadata } from "@/shared/lib/seo";
import { notFound } from "next/navigation";
import { MARKETS, getMarket } from "@/shared/config/markets";
import { TradeScreen } from "@/features/perp/components/trade-screen";

export function generateStaticParams() {
  return MARKETS.map((m) => ({ market: m.symbol }));
}

async function resolveMarket(params: PageProps<"/trade/[market]">["params"]) {
  const { market } = await params;
  return getMarket(decodeURIComponent(market));
}

export async function generateMetadata({ params }: PageProps<"/trade/[market]">): Promise<Metadata> {
  const market = await resolveMarket(params);
  if (!market) return { title: "Market not found", robots: { index: false } };
  return pageMetadata({
    title: `${market.symbol}-PERP`,
    description: `Trade ${market.name} (${market.symbol}) perpetual futures up to ${market.maxLeverage}x, quoted in USDC. Self-custodied, onchain settlement, Pyth mark price.`,
    path: `/trade/${market.symbol}`,
  });
}

export default async function TradePage({ params }: PageProps<"/trade/[market]">) {
  const market = await resolveMarket(params);
  if (!market) notFound();
  return <TradeScreen market={market} />;
}
