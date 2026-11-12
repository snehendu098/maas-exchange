"use client";

import { useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import { areaPath, boundsFor, linePath, nearestIndex, percentX, percentY, visibleRange, yTicks, type SeriesPoint } from "@/shared/lib/chart/svg-chart";
import { axisCaption } from "@/shared/lib/chart/axis-time";
import { SeriesPlot, type ChartType } from "./series-plot";
import { SeriesDot, SeriesReadout } from "./series-readout";
import { useChartView } from "./use-chart-view";

const TICK_COUNT = 5;
const CAPTIONS = 7;

interface SeriesChartProps {
  points: SeriesPoint[];
  type: ChartType;
  label: string;
  formatValue: (value: number) => string;
  formatTick: (value: number, step: number) => string;
  formatTime: (ts: number) => string;
}

/** kimia-style svg series: wheel zoom, drag pan, dbl-click reset, crosshair readout */
export function SeriesChart({ points, type, label, formatValue, formatTick, formatTime }: SeriesChartProps) {
  const count = points.length;
  const values = useMemo(() => points.map((p) => p.value), [points]);
  const { plotRef, view, hovered, panning, handlers } = useChartView(count);
  const bounds = useMemo(() => boundsFor(values, view, { tickCount: TICK_COUNT }), [values, view]);
  const { first, last } = visibleRange(view, count);
  const visible = useMemo(() => values.slice(first, last + 1), [values, first, last]);
  const line = useMemo(() => linePath(visible, bounds, first), [visible, bounds, first]);
  const area = useMemo(() => areaPath(visible, bounds, first), [visible, bounds, first]);

  const ticks = yTicks(bounds);
  const head = Math.min(count - 1, Math.floor(view.end + 1e-6));
  const active = hovered ?? head;
  const activeTop = percentY(values[active], bounds);
  const span = (points[last]?.time ?? 0) - (points[first]?.time ?? 0);
  const captions = Array.from({ length: CAPTIONS }, (_, i) => points[nearestIndex(i / (CAPTIONS - 1), view, count)].time);

  return (
    <figure aria-label={label} className="flex size-full flex-col px-3 pt-4 pb-3 sm:px-4">
      <div className="flex min-h-0 flex-1">
        <div
          ref={plotRef}
          className={cn("relative flex-1 touch-pan-y border-b border-dashed border-border", panning ? "cursor-grabbing" : "cursor-crosshair")}
          {...handlers}
        >
          {ticks.map((tick) => (
            <span key={tick} aria-hidden className="absolute inset-x-0 border-t border-border/50" style={{ top: `${percentY(tick, bounds)}%` }} />
          ))}
          <SeriesPlot line={line} area={area} type={type} />
          <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-brand/30" style={{ top: `${activeTop}%` }} />
          <SeriesDot left={percentX(head, bounds)} top={percentY(values[head], bounds)} />
          {hovered !== null && (
            <SeriesReadout left={percentX(active, bounds)} top={activeTop} value={formatValue(values[active])} time={formatTime(points[active].time)} />
          )}
        </div>
        <YAxis ticks={ticks} step={bounds.step} top={(v) => percentY(v, bounds)} format={formatTick} tag={formatValue(values[active])} tagTop={activeTop} />
      </div>
      <figcaption className="flex justify-between pt-2 pr-24 font-mono text-[11px] text-fg-muted">
        {captions.map((ts, i) => (
          // keyed by slot: short windows repeat a date
          <span key={i}>{axisCaption(ts, span)}</span>
        ))}
      </figcaption>
    </figure>
  );
}

interface YAxisProps {
  ticks: number[];
  step: number;
  top: (value: number) => number;
  format: (value: number, step: number) => string;
  tag: string;
  tagTop: number;
}

/** right gutter ticks + live level tag */
function YAxis({ ticks, step, top, format, tag, tagTop }: YAxisProps) {
  return (
    <div className="relative w-24 shrink-0 font-mono text-[11px] tabular-nums">
      {ticks.map((tick) => (
        <span key={tick} className="absolute left-2 -translate-y-1/2 text-fg-muted" style={{ top: `${top(tick)}%` }}>
          {format(tick, step)}
        </span>
      ))}
      <span
        className="absolute left-0 -translate-y-1/2 rounded-md bg-brand px-1.5 py-0.5 font-medium text-brand-fg"
        style={{ top: `${Math.min(98, Math.max(2, tagTop))}%` }}
      >
        {tag}
      </span>
    </div>
  );
}
