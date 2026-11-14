"use client";

import { formatCompactUsd } from "@/shared/lib/format";
import { fundingPercent } from "@/features/perp/lib/market-format";
import { formatRaw, usdcToNumber } from "@/shared/lib/units";
import { StatBox, StatStrip, toneOf } from "@/shared/ui/stat-box";
import { useVaultState } from "../../hooks/use-vault";
import { useLastFundingRates } from "../../hooks/use-vault-history";
import { sharePrice } from "../../lib/share-math";
import { VaultIdentity } from "./vault-identity";

const DASH = "—";
/** Asset bar: vault identity + full-height metric strip. */
export function VaultHeader() {
  const vault = useVaultState().data;
  // plain mean of the markets' last settled 1h prints (perp gateway), hourly %, not annualized
  const rates = Object.values(useLastFundingRates().data ?? {});
  const mean = rates.length ? fundingPercent(rates.reduce((s, r) => s + r, 0n) / BigInt(rates.length)) : undefined;

  return (
    <header className="relative z-20 flex shrink-0 flex-col border-b border-border lg:h-[84px] lg:flex-row lg:items-stretch">
      <VaultIdentity legs={vault?.legs.length} />
      <StatStrip className="sm:grid-cols-3 lg:border-l lg:border-border [&_dd]:text-xl [&_dt]:text-xs">
        <StatBox label="NAV" value={vault ? formatCompactUsd(usdcToNumber(vault.totalAssets)) : DASH} />
        <StatBox label="Share price" value={vault ? `$${formatRaw(sharePrice(vault.totalAssets, vault.totalSupply), 6, 4)}` : DASH} />
        <StatBox label="Last 1H Funding rate" value={mean === undefined ? DASH : `${mean.toFixed(4)}%`} tone={mean === undefined ? "default" : toneOf(mean)} />
      </StatStrip>
    </header>
  );
}
