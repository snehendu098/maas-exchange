"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** pill fill + selected label per accent */
const ACCENT = {
  brand: { pill: "bg-surface-raised", text: "text-fg" },
  up: { pill: "bg-up-soft", text: "text-up" },
  down: { pill: "bg-down-soft", text: "text-down" },
  fg: { pill: "bg-fg", text: "text-bg" },
} as const;

export type TabAccent = keyof typeof ACCENT;

interface TabBarProps<T extends string> {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange?: (value: T) => void;
  accent?: TabAccent;
  /** equal = split row, hug = sized to label */
  fill?: "equal" | "hug";
  size?: "sm" | "md" | "lg";
  /** false when the parent row owns the hairline */
  bordered?: boolean;
  divided?: boolean;
  className?: string;
  "aria-label"?: string;
}

const SIZES = {
  sm: "h-9 text-[13px]",
  md: "h-12 text-sm",
  lg: "h-full min-h-12 text-[15px]",
} as const;


const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

/** Tab row; split tabs slide a full-box highlight, hug tabs just brighten text. */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  accent = "brand",
  fill = "hug",
  size = "md",
  bordered = true,
  divided = false,
  className,
  ...aria
}: TabBarProps<T>) {
  const row = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = row.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const next = active ? { x: active.offsetLeft, width: active.offsetWidth } : null;
      // same box = same state, so fresh option arrays can't loop
      setPill((prev) => (prev?.x === next?.x && prev?.width === next?.width ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, options]);

  return (
    <div
      ref={row}
      role="tablist"
      {...aria}
      className={cn(
        "relative flex",
        bordered && "border-b border-border",
        divided && "divide-x divide-border",
        fill === "hug" && "gap-1",
        className,
      )}
    >
      {pill && fill === "equal" && (
        <motion.span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 border-0!", ACCENT[accent].pill)}
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={SPRING}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={option.disabled || undefined}
            onClick={() => !option.disabled && onChange?.(option.value)}
            className={cn(
              "relative z-[1] flex items-center justify-center font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              SIZES[size],
              fill === "equal" ? "flex-1" : "px-3.5",
              selected ? (fill === "equal" ? ACCENT[accent].text : "text-fg") : "text-fg-muted hover:text-fg",
              option.disabled && "cursor-not-allowed text-fg-subtle hover:text-fg-subtle",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
