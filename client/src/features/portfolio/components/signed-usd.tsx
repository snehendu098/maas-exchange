import { cn } from "@/shared/lib/cn";
import { formatSignedUsd } from "@/shared/lib/format";

/** Signed figure tinted by its own sign; null = unknown dash. */
export function SignedUsd({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("text-fg-muted tabular-nums", className)}>–</span>;
  return <span className={cn("tabular-nums", value < 0 ? "text-down" : "text-up", className)}>{formatSignedUsd(value)}</span>;
}
