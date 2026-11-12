import { cn } from "@/shared/lib/cn";
import { formatSignedPercent } from "@/shared/lib/format";

/** Tinted signed-percent chip. `value` is a percent: -2.55 = -2.55%. */
export function ChangeBadge({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        value < 0 ? "bg-down-soft text-down" : "bg-up-soft text-up",
        className,
      )}
    >
      {formatSignedPercent(value, decimals)}
    </span>
  );
}
