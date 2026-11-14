import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type StatTone = "default" | "up" | "down" | "muted";

interface StatBoxProps {
  label: string;
  value: ReactNode;
  /** after the value, e.g. a countdown */
  extra?: ReactNode;
  /** extra on its own line, for narrow cells */
  stacked?: boolean;
  tone?: StatTone;
  /** cell = strip cell, inline = bare label over value */
  variant?: "cell" | "inline";
  className?: string;
}

const TONE: Record<StatTone, string> = {
  default: "text-fg",
  up: "text-up",
  down: "text-down",
  muted: "text-fg-muted",
};

/** One cell of a metric strip. Wrap a row of them in <StatStrip>. */
export function StatBox({ label, value, extra, stacked, tone = "default", variant = "cell", className }: StatBoxProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center",
        variant === "cell" && "flex-1 bg-surface px-4 py-3 lg:min-w-[120px] lg:px-4 2xl:px-5",
        className,
      )}
    >
      <dt className="label-mono truncate text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "flex truncate text-[17px] font-medium tabular-nums",
          stacked ? "mt-1 flex-col leading-tight" : "items-baseline gap-2",
          !stacked && "mt-1.5",
          TONE[tone],
        )}
      >
        {value}
        {extra && <span className={cn("text-fg-muted", stacked ? "text-[12px] leading-tight" : "text-[13px]")}>{extra}</span>}
      </dd>
    </div>
  );
}

/** Hairline-separated grid of StatBox cells. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid min-w-0 grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:flex lg:flex-1", className)}>
      {children}
    </dl>
  );
}

export const toneOf = (n: number): StatTone => (n < 0 ? "down" : "up");
