import { cn } from "@/shared/lib/cn";
import { formatCompactUsd, formatUsd } from "@/shared/lib/format";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import type { AllocationKey, AllocationSlice } from "../../lib/allocation";

const SWATCH: Record<AllocationKey, string> = { perp: "bg-brand", vault: "bg-brand/45", wallet: "bg-fg-muted/50" };

/** USDC split across perp margin, vault shares and wallet. */
export function AllocationSection({ total, slices, connected }: { total: number; slices: AllocationSlice[]; connected: boolean }) {
  const filled = slices.filter((s) => s.share > 0);
  return (
    <Panel aria-label="Allocation">
      <PanelHeader title="Allocation" actions={<span className="font-mono text-[11px] text-fg-muted">{connected ? formatCompactUsd(total) : "—"}</span>} />
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-surface-raised">
          {filled.map((s) => (
            <span key={s.key} title={s.label} style={{ width: `${s.share * 100}%` }} className={cn("h-full rounded-full", SWATCH[s.key])} />
          ))}
        </div>
        <dl className="space-y-2.5">
          {slices.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 text-sm">
              <dt className="flex items-center gap-2 text-fg-muted">
                <span className={cn("size-2 rounded-full", SWATCH[s.key])} />
                {s.label}
              </dt>
              <dd className="flex items-baseline gap-2 tabular-nums">
                {connected ? formatUsd(s.value) : "—"}
                <span className="w-12 text-right font-mono text-[11px] text-fg-muted">{(s.share * 100).toFixed(1)}%</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}
