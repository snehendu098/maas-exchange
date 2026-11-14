"use client";

import { memo, useId } from "react";
import { motion } from "motion/react";
import { CHART_HEIGHT, CHART_WIDTH } from "@/shared/lib/chart/svg-chart";

export type ChartType = "line" | "area";

interface SeriesPlotProps {
  line: string;
  area: string;
  type: ChartType;
}

const STROKE = { fill: "none", strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" } as const;
const stop = (offset: string, opacity: number) => (
  <stop offset={offset} style={{ stopColor: "var(--color-brand)", stopOpacity: opacity }} />
);

/** brand line, optional dotted gradient area; glow = wide faint stroke (filters smear on non-uniform scale) */
export const SeriesPlot = memo(function SeriesPlot({ line, area, type }: SeriesPlotProps) {
  const id = useId();
  const [dots, fill, glow] = [`${id}-dots`, `${id}-fill`, `${id}-glow`];
  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <pattern id={dots} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1" className="fill-brand/40" />
        </pattern>
        <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CHART_HEIGHT}>
          {stop("0%", 0.3)}
          {stop("100%", 0.02)}
        </linearGradient>
        <linearGradient id={glow} x1="0" y1="0" x2="0" y2="1">
          {stop("0%", 0.25)}
          {stop("100%", 0.05)}
        </linearGradient>
      </defs>
      {type === "area" && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <path d={area} fill={`url(#${fill})`} />
          <path d={area} fill={`url(#${dots})`} />
        </motion.g>
      )}
      <path d={line} {...STROKE} strokeWidth={6} stroke={`url(#${glow})`} />
      <motion.path
        d={line}
        {...STROKE}
        strokeWidth={2}
        className="stroke-brand"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
});
