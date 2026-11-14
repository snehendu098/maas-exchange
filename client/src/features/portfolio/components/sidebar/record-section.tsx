import { getMarketById } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import { TokenLogo } from "@/shared/ui/token-logo";
import type { OutcomeSummary, ReturnBand, TradeOutcome } from "../../lib/pnl-history";
import { SignedUsd } from "../signed-usd";

interface RecordSectionProps {
  record: OutcomeSummary;
  bands: ReturnBand[];
  closed: number;
}

/** Best / worst close and a return histogram over closed trades. */
export function RecordSection({ record, bands, closed }: RecordSectionProps) {
  const peak = Math.max(...bands.map((b) => b.count), 1);
  return (
    <Panel aria-label="Trade record">
      <PanelHeader title="Trade record" actions={<span className="font-mono text-[11px] text-fg-muted">{closed} closed</span>} />
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <Extreme label="Best close" trade={record.biggestWin} />
        <Extreme label="Worst close" trade={record.biggestLoss} />
      </div>
      <div className="px-4 py-5 sm:px-5">
        <p className="label-mono text-fg-muted">Return per close</p>
        {bands.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">Fills in once a trade closes.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bands.map((b) => (
              <li key={b.label} className="grid grid-cols-[76px_minmax(0,1fr)_24px] items-center gap-3 font-mono text-[11px]">
                <span className="text-fg-muted">{b.label}</span>
                <span className="h-1.5 rounded-full bg-surface-raised">
                  <span
                    className={cn("block h-full rounded-full", b.tone === "up" ? "bg-up/70" : "bg-down/70")}
                    style={{ width: `${(b.count / peak) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{b.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Extreme({ label, trade }: { label: string; trade: TradeOutcome | null }) {
  const market = trade ? getMarketById(trade.market) : undefined;
  return (
    <div className="bg-bg px-4 py-3 sm:px-5">
      <p className="label-mono text-fg-muted">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm">
        {trade ? (
          <>
            {market && <TokenLogo asset={market} size={16} />}
            <span>{market?.symbol ?? `#${trade.market}`}</span>
            <SignedUsd value={trade.pnl} />
          </>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </p>
    </div>
  );
}
