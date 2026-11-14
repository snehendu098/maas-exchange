"use client";

import { useId } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { SeriesPoint } from "@/shared/lib/chart/svg-chart";
import { axisCaption, dayTick, stampTick, timeTicks } from "@/shared/lib/chart/axis-time";
import { formatCompactUsd, formatSignedUsd } from "@/shared/lib/format";

const TICK = { fill: "var(--color-fg-muted)", fontSize: 11 };
const yTick = (v: number) => (v < 0 ? `-${formatCompactUsd(-v)}` : formatCompactUsd(v));

function PnlTooltip({ active, payload, label }: TooltipContentProps) {
  const value = payload?.[0]?.value;
  if (!active || typeof value !== "number") return null;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs shadow-xl">
      {typeof label === "number" && <p className="font-medium text-fg">{stampTick(label)}</p>}
      <div className="flex items-center justify-between gap-4 leading-none">
        <span className="text-fg-muted">Net PnL</span>
        <span className={value < 0 ? "font-mono font-medium text-down tabular-nums" : "font-mono font-medium text-up tabular-nums"}>{formatSignedUsd(value)}</span>
      </div>
    </div>
  );
}

/** Cumulative net pnl over real time (one point per trade), green/red by result; footer: change + dates. */
export function PnlAreaChart({ points, rangeLabel, change }: { points: SeriesPoint[]; rangeLabel: string; change: number }) {
  const gradient = useId();
  const first = points[0];
  const last = points.at(-1) ?? first;
  const Trend = change < 0 ? TrendingDown : TrendingUp;
  const span = last.time - first.time;
  const color = last.value < 0 ? "var(--color-down)" : "var(--color-up)";

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 px-2 pt-4 sm:px-6">
        <AreaChart responsive accessibilityLayer data={points} margin={{ top: 12, left: 4, right: 0 }} style={{ width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--pv-grid)" />
          <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={timeTicks(first.time, last.time)} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tick={TICK} tickFormatter={(t: number) => axisCaption(t, span)} />
          <YAxis orientation="right" tickLine={false} axisLine={false} tickMargin={8} width={68} tick={TICK} tickFormatter={yTick} />
          <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeDasharray="4 4" />
          <Tooltip cursor={{ stroke: "var(--color-border-strong)" }} content={(p) => <PnlTooltip {...p} />} />
          <Area
            dataKey="value"
            type="monotone"
            fill={`url(#${gradient})`}
            stroke={color}
            strokeWidth={2}
            activeDot={{ r: 4, fill: color, stroke: "var(--color-bg)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </div>
      <footer className="grid shrink-0 gap-2 px-4 py-4 text-sm sm:px-6">
        <p className="flex items-center gap-2 leading-none font-medium text-fg">
          {change === 0 ? "Flat" : `${change > 0 ? "Up" : "Down"} ${formatSignedUsd(change).slice(1)}`} over {rangeLabel}
          <Trend className={change < 0 ? "size-4 text-down" : "size-4 text-up"} strokeWidth={1.75} />
        </p>
        <p className="leading-none text-fg-muted">
          {/* same-day range: show times, not "Nov 6 – Nov 6" */}
          {span < 86_400 ? `${stampTick(first.time)} – ${axisCaption(last.time, 0)}` : `${dayTick(first.time)} – ${dayTick(last.time)}`}
        </p>
      </footer>
    </div>
  );
}
