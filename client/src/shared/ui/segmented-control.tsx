"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";
import type { TabOption } from "./tab-bar";

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** fill = stretch evenly */
  layout?: "fill" | "hug";
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

const SLIDE = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Pill group; muted segment slides to the pick. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layout = "hug",
  size = "md",
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const highlightId = useId();

  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1",
        size === "md" ? "h-10" : "h-8",
        layout === "fill" && "flex w-full",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-full items-center justify-center rounded-full whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              size === "md" ? "px-4 text-[13px] font-medium" : "px-3 text-xs font-medium",
              layout === "fill" && "flex-1",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected && (
              <motion.span
                aria-hidden
                layoutId={`segment-${highlightId}`}
                transition={SLIDE}
                className="absolute inset-0 rounded-full bg-surface-raised"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
