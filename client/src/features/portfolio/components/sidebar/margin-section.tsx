import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import type { HealthLevel, MarginHealth } from "../../lib/margin-health";

const LEVEL: Record<HealthLevel, { label: string; text: string; fill: string }> = {
  idle: { label: "No exposure", text: "text-fg-muted", fill: "bg-fg-muted/40" },
  safe: { label: "Healthy", text: "text-up", fill: "bg-up" },
  watch: { label: "Watch", text: "text-warn", fill: "bg-warn" },
  risk: { label: "At risk", text: "text-down", fill: "bg-down" },
};

interface MarginSectionProps {
  health: MarginHealth;
  initial: number;
  maintenance: number;
  connected: boolean;
}

const pct = (v: number) => `${(Math.min(v, 9.99) * 100).toFixed(1)}%`;

/** Liquidation meter: maint. margin over equity, liquidates at 100%. */
export function MarginSection({ health, initial, maintenance, connected }: MarginSectionProps) {
  const level = LEVEL[connected ? health.level : "idle"];
  const usd = (v: number) => (connected ? formatUsd(v) : "—");
  return (
    <Panel aria-label="Margin health">
      <PanelHeader title="Margin health" actions={<span className={cn("font-mono text-[11px]", level.text)}>{level.label}</span>} />
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div>
          <div className="relative h-1.5 rounded-full bg-surface-raised">
            <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width]", level.fill)} style={{ width: `${Math.min(health.ratio, 1) * 100}%` }} />
            {[50, 80].map((mark) => (
              <span key={mark} aria-hidden className="absolute -inset-y-1 w-px bg-border-strong" style={{ left: `${mark}%` }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-fg-muted">
            <span>Safe</span>
            <span>Liquidation</span>
          </div>
        </div>
        <dl className="space-y-2.5 text-sm">
          <Row label="Maint. ratio" value={connected ? pct(health.ratio) : "—"} />
          <Row label="Margin in use" value={connected ? pct(health.usage) : "—"} />
          <Row label="Initial margin" value={usd(initial)} />
          <Row label="Maint. margin" value={usd(maintenance)} />
        </dl>
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
