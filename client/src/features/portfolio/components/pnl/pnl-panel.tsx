"use client";

import { useMemo, useState } from "react";
import { ChartColumn, ChartSpline } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { WipeReveal } from "@/shared/ui/motion/wipe-reveal";
import { IconToggle, type IconToggleOption } from "@/shared/ui/icon-toggle";
import { Panel } from "@/shared/ui/panel";
import { SelectMenu } from "@/shared/ui/select-menu";
import { pnlBucketChange, pnlTimeline, type PnlEvent, type PnlRange } from "../../lib/pnl-history";
import { PnlAreaChart } from "./pnl-area-chart";
import { PnlBarChart } from "./pnl-bar-chart";

const RANGES = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
] as const satisfies ReadonlyArray<{ value: PnlRange; label: string }>;

type PnlView = "bars" | "line";

// bar width follows the range (see RANGES in pnl-history)
const BAR_TITLE: Record<PnlRange, string> = { "1h": "PnL per 5 min", "24h": "Hourly PnL", "7d": "Daily PnL", "30d": "Daily PnL", all: "Daily PnL" };

const VIEWS: ReadonlyArray<IconToggleOption<PnlView>> = [
  { value: "line", label: "Cumulative line", Icon: ChartSpline },
  { value: "bars", label: "Bars", Icon: ChartColumn },
];

interface PnlPanelProps {
  events: PnlEvent[];
  /** open-position pnl added to today's point */
  unrealized: bigint;
  connected: boolean;
  className?: string;
}

/** Card: title, bars/line toggle, range select; per-period bars or cumulative line. */
export function PnlPanel({ events, unrealized, connected, className }: PnlPanelProps) {
  const [range, setRange] = useState<PnlRange>("24h");
  const [view, setView] = useState<PnlView>("line");
  const bars = view === "bars";
  // clock read client side only; nothing to plot on prerender
  const { buckets, cumulative } = useMemo(() => {
    if (!connected || !events.length) return { buckets: [], cumulative: [] };
    return { buckets: pnlBucketChange(events, range, unrealized), cumulative: pnlTimeline(events, range, unrealized) };
  }, [connected, events, range, unrealized]);
  const points = bars ? buckets : cumulative;
  const title = bars ? BAR_TITLE[range] : "Cumulative PnL";
  // both views report the same range total
  const change = buckets.reduce((a, p) => a + p.value, 0);
  const label = RANGES.find((r) => r.value === range)?.label.toLowerCase();

  return (
    <Panel aria-label={title} className={className}>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="grid flex-1 gap-1">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="text-xs text-fg-muted">Net of fees and funding, {label}</p>
        </div>
        <IconToggle aria-label="PnL chart" options={VIEWS} value={view} onChange={setView} />
        <SelectMenu label="PnL range" size="sm" align="right" options={RANGES} value={range} onChange={setRange} />
      </header>
      <div className="relative min-h-0 flex-1">
        {points.length ? (
          <WipeReveal revealKey={`${view}-${range}`}>
            {bars ? <PnlBarChart points={points} rangeLabel={label ?? ""} change={change} /> : <PnlAreaChart points={points} rangeLabel={label ?? ""} change={change} />}
          </WipeReveal>
        ) : (
          <EmptyState className="absolute inset-0">{connected ? "No trades yet" : "Connect a wallet to chart your PnL"}</EmptyState>
        )}
      </div>
    </Panel>
  );
}
