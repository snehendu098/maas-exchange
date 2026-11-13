"use client";

import type { MarketConfig } from "@/shared/config/markets";
import { formatCompactUsd, formatSignedPercent } from "@/shared/lib/format";
import { sizeToNumber, usdcToNumber } from "@/shared/lib/units";
import { StatBox, StatStrip, toneOf } from "@/shared/ui/stat-box";
import { useMarketStat } from "../../hooks/use-market-data";
import { change24hPercent, fmtPrice, formatFunding, fundingPercent } from "../../lib/market-format";
import { AssetSelector } from "./asset-selector";
import { FundingCountdown } from "./funding-countdown";

const DASH = "—";

/** Asset bar: market switcher + full-height metric strip. */
export function MarketHeader({ market }: { market: MarketConfig }) {
  const stats = useMarketStat(market.id);
  const change = stats ? change24hPercent(stats) : 0;
  const funding = stats ? fundingPercent(stats.fundingRate) : 0;
  const mark = stats ? Number(stats.markPrice) / 1e6 : 0;

  return (
    <header className="relative z-20 flex shrink-0 flex-col border-b border-border lg:h-[84px] lg:flex-row lg:items-stretch">
      <AssetSelector market={market} className="flex shrink-0 border-b border-border lg:border-b-0" />

      <StatStrip className="scrollbar-none lg:overflow-x-auto lg:border-l lg:border-border">
        <StatBox label="Mark" value={stats ? `$${fmtPrice(stats.markPrice, market)}` : DASH} tone={stats ? toneOf(change) : "default"} />
        <StatBox label="Index" value={stats ? `$${fmtPrice(stats.indexPrice, market)}` : DASH} />
        <StatBox label="24h change" value={stats ? formatSignedPercent(change) : DASH} tone={stats ? toneOf(change) : "default"} />
        <StatBox label="24h volume" value={stats ? formatCompactUsd(usdcToNumber(stats.volume24h)) : DASH} />
      </StatStrip>

      {/* 300px halves = order book + its tab split below */}
      <StatStrip className="border-t border-border lg:w-[300px] lg:flex-none lg:border-t-0 lg:border-l">
        <StatBox label="Open int." className="lg:min-w-0 lg:basis-0" value={stats ? formatCompactUsd(sizeToNumber(stats.openInterest) * mark) : DASH} />
        <StatBox
          label="Funding"
          className="lg:min-w-0 lg:basis-0"
          stacked
          value={stats ? formatFunding(funding) : DASH}
          tone={stats ? toneOf(funding) : "default"}
          extra={stats && <FundingCountdown nextFundingTime={stats.nextFundingTime} />}
        />
      </StatStrip>
    </header>
  );
}
