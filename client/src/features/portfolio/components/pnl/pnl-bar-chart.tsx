"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { SeriesPoint } from "@/shared/lib/chart/svg-chart";
import { axisCaption, dayTick, stampTick } from "@/shared/lib/chart/axis-time";
import { formatCompactUsd, formatSignedUsd } from "@/shared/lib/format";

const TICK = { fill: "var(--color-fg-muted)", fontSize: 11 };
const UP = "var(--color-up)";
const DOWN = "var(--color-down)";
const FLAT = "var(--color-border-strong)";

const yTick = (v: number) => (v < 0 ? `-${formatCompactUsd(-v)}` : formatCompactUsd(v));

function PnlTooltip({ active, payload, label, intraday }: TooltipContentProps & { intraday: boolean }) {
  const value = payload?.[0]?.value;
  if (!active || typeof value !== "number") return null;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs shadow-xl">
      {typeof label === "number" && <p className="font-medium text-fg">{intraday ? stampTick(label) : dayTick(label)}</p>}
      <div className="flex items-stretch gap-2">
        <span className={value < 0 ? "w-1 shrink-0 rounded-[2px] bg-down" : "w-1 shrink-0 rounded-[2px] bg-up"} />
        <span className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-fg-muted">PnL</span>
          <span className="font-mono font-medium text-fg tabular-nums">{formatSignedUsd(value)}</span>
        </span>
      </div>
    </div>
  );
}

/** Per-period net pnl bars, green up / red down, scale on the right; footer: range total + dates. */
export function PnlBarChart({ points, rangeLabel, change }: { points: SeriesPoint[]; rangeLabel: string; change: number }) {
  const first = points[0];
  const last = points.at(-1) ?? first;
  const Trend = change < 0 ? TrendingDown : TrendingUp;
  const span = last.time - first.time;
  const intraday = span < 2 * 86_400;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 px-2 pt-4 sm:px-6">
        <BarChart responsive accessibilityLayer data={points} barCategoryGap="12%" margin={{ top: 8, left: 4, right: 0 }} style={{ width: "100%", height: "100%" }}>
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={TICK} tickFormatter={(t: number) => axisCaption(t, span)} />
          <YAxis orientation="right" tickLine={false} axisLine={false} tickMargin={8} width={68} tick={TICK} tickFormatter={yTick} />
          <ReferenceLine y={0} stroke="var(--color-border-strong)" />
          <Tooltip cursor={{ fill: "var(--color-surface-raised)", opacity: 0.5 }} content={(p) => <PnlTooltip {...p} intraday={intraday} />} />
          <Bar dataKey="value" radius={4} maxBarSize={56} minPointSize={3} isAnimationActive={false}>
            {/* flat days = faint stub so every day reads */}
            {points.map((p) => (
              <Cell key={p.time} fill={p.value < 0 ? DOWN : p.value > 0 ? UP : FLAT} />
            ))}
          </Bar>
        </BarChart>
      </div>
      <footer className="grid shrink-0 gap-2 px-4 py-4 text-sm sm:px-6">
        <p className="flex items-center gap-2 leading-none font-medium text-fg">
          {change === 0 ? "Flat" : `${change > 0 ? "Up" : "Down"} ${formatSignedUsd(change).slice(1)}`} over {rangeLabel}
          <Trend className={change < 0 ? "size-4 text-down" : "size-4 text-up"} strokeWidth={1.75} />
        </p>
        <p className="leading-none text-fg-muted">
          {span < 86_400 ? `${stampTick(first.time)} – ${axisCaption(last.time, 0)}` : `${dayTick(first.time)} – ${dayTick(last.time)}`}
        </p>
      </footer>
    </div>
  );
}
