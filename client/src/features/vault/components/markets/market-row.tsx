import { getMarket } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { Td, Tr } from "@/shared/ui/table";
import { TokenLogo } from "@/shared/ui/token-logo";
import { fmtSize, formatFunding, fundingPercent } from "@/features/perp/lib/market-format";
import type { VaultLeg } from "../../api/types";
import type { MarketFunding } from "../../lib/funding";
import { formatBpsPercent, formatDuration } from "../../lib/vault-format";
import { ModeBadge } from "../ui/mode-badge";

interface MarketRowProps {
  leg: VaultLeg;
  funding?: MarketFunding;
  /** unix s, 0 during prerender */
  now: number;
}

/** one vault leg: chain state + latest funding print */
export function MarketRow({ leg, funding, now }: MarketRowProps) {
  const market = getMarket(leg.market);
  const rate = funding?.latest?.rate;
  const since = funding?.negativeSince ?? null;
  const flat = leg.mode === "FLAT";
  return (
    <Tr>
      <Td>
        <span className="flex items-center gap-2.5">
          {market && <TokenLogo asset={market} size={20} />}
          {leg.market}
        </span>
      </Td>
      <Td className="text-right">{formatBpsPercent(leg.weightBps)}</Td>
      <Td>
        <span className="flex items-center gap-2">
          <ModeBadge mode={leg.mode} />
          {flat && since !== null && (
            <span title="Funding negative for" className="font-mono text-[11px] text-down">
              {now === 0 ? "…" : formatDuration(now - since)}
            </span>
          )}
        </span>
      </Td>
      <Td className="text-right" title={market ? `+${fmtSize(leg.spotSize, market)} spot / ${fmtSize(-leg.shortSize, market)} perp` : undefined}>
        {market && leg.spotSize > 0n ? fmtSize(leg.spotSize, market) : <span className="text-fg-muted">—</span>}
      </Td>
      <Td className={cn("text-right", rate !== undefined && (rate < 0n ? "text-down" : "text-up"))}>
        {rate === undefined ? "—" : formatFunding(fundingPercent(rate))}
      </Td>
    </Tr>
  );
}
