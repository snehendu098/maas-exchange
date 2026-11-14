import { cn } from "@/shared/lib/cn";

const W = 88;
const H = 28;

/** Tiny cumulative-pnl line, green/red by final value. */
export function PnlSparkline({ points, className }: { points: readonly number[]; className?: string }) {
  if (points.length < 2) return null;
  const series = [0, ...points];
  const min = Math.min(...series);
  const span = Math.max(...series) - min || 1;
  const d = series.map((v, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join(" ");
  const up = series.at(-1)! >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className={cn(up ? "text-up" : "text-down", className)}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
