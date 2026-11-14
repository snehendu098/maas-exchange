"use client";

import type { KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";
import { percentFor, valueAt } from "@/shared/lib/track";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** evenly spaced stops; the track is piecewise-linear between them */
  marks?: readonly number[];
  label: string;
  formatValue?: (value: number) => string;
  formatMark?: (mark: number) => string;
  tone?: "up" | "down" | "brand";
  /** drop the label/value row (label stays as aria-label) */
  bare?: boolean;
  className?: string;
}

const POSITIONS = 1000;
const SPRING = { type: "spring", stiffness: 700, damping: 42, mass: 0.5 } as const;
const FILL = { up: "bg-up", down: "bg-down", brand: "bg-brand" } as const;

/** Integer slider: round thumb, filled track, clickable marks. */
export function Slider({
  value,
  onChange,
  min,
  max,
  marks,
  label,
  formatValue = String,
  formatMark = formatValue,
  tone = "up",
  bare,
  className,
}: SliderProps) {
  const stops = marks && marks.length > 1 ? marks : [min, max];
  const clamped = Math.min(max, Math.max(min, Math.round(value) || min));
  const fill = percentFor(clamped, stops);
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (e.key in step) set(clamped + step[e.key]);
    else if (e.key === "Home") set(min);
    else if (e.key === "End") set(max);
    else return;
    e.preventDefault();
  };

  return (
    <div className={className}>
      {!bare && (
        <div className="flex items-baseline justify-between gap-4">
          <p className="label-mono text-fg-muted">{label}</p>
          <p className="text-xl font-medium text-fg tabular-nums">{formatValue(clamped)}</p>
        </div>
      )}

      <div className={cn("relative flex h-5 items-center", !bare && "mt-3")}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <motion.div
            className={cn("h-full rounded-full", FILL[tone])}
            initial={false}
            animate={{ width: `${fill}%` }}
            transition={SPRING}
          />
        </div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute size-[18px] -translate-x-1/2 rounded-full border-2 border-bg bg-fg shadow-[0_1px_4px_rgb(0_0_0/0.5)]"
          initial={false}
          animate={{ left: `${fill}%` }}
          transition={SPRING}
        />
        <input
          type="range"
          min={0}
          max={POSITIONS}
          step={1}
          value={Math.round((fill / 100) * POSITIONS)}
          onChange={(e) => set(valueAt((Number(e.target.value) / POSITIONS) * 100, stops))}
          onKeyDown={onKeyDown}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          aria-valuetext={formatValue(clamped)}
          className="absolute inset-x-0 h-5 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      {marks && (
        <div className="mt-3 flex justify-between">
          {marks.map((mark) => (
            <button
              key={mark}
              type="button"
              onClick={() => set(mark)}
              className={cn(
                "text-xs tabular-nums transition-colors hover:text-fg",
                clamped === mark ? "text-fg" : "text-fg-muted",
              )}
            >
              {formatMark(mark)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
