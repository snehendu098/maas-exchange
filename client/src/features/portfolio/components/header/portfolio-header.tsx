import { formatCompactUsd, formatSignedUsd, formatUsd } from "@/shared/lib/format";
import { StatBox, StatStrip, toneOf } from "@/shared/ui/stat-box";
import type { Portfolio } from "../../hooks/use-portfolio";
import { TraderIdentity } from "./trader-identity";

const DASH = "—";

/** Asset bar: trader identity + pnl / activity strip. */
export function PortfolioHeader({ p }: { p: Portfolio }) {
  const signed = (v: number) => {
    if (!p.connected) return { value: DASH };
    return v === 0 ? { value: formatUsd(0) } : { value: formatSignedUsd(v), tone: toneOf(v) };
  };
  const plain = (v: string) => (p.connected ? v : DASH);
  const winRate = p.record.winRate;

  return (
    <header className="relative z-20 flex shrink-0 flex-col border-b border-border lg:h-[84px] lg:flex-row lg:items-stretch">
      <TraderIdentity trader={p.trader} positions={p.openPositions} />
      <StatStrip className="lg:border-l lg:border-border">
        <StatBox label="Net PnL" {...signed(p.net)} extra={p.connected && p.funding !== 0 && `${formatSignedUsd(-p.funding)} funding`} />
        <StatBox label="Unrealized" {...signed(p.unrealized)} />
        <StatBox label="Realized" {...signed(p.realized)} />
        <StatBox label="Volume" value={plain(formatCompactUsd(p.volume))} />
        <StatBox label="Fees paid" value={plain(formatUsd(p.fees, 2))} />
        <StatBox
          label="Win rate"
          value={winRate === null ? DASH : `${winRate.toFixed(1)}%`}
          tone={winRate === null ? "default" : winRate >= 50 ? "up" : "down"}
          extra={p.connected && `${p.closed} closed`}
        />
      </StatStrip>
    </header>
  );
}
