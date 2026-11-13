import { cn } from "@/shared/lib/cn";

/** bubble flips left of crosshair past this % */
const FLIP_AT = 58;

interface Spot {
  left: number;
  top: number;
}

export const SeriesDot = ({ left, top }: Spot) => (
  <span
    aria-hidden
    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-bg"
    style={{ left: `${left}%`, top: `${top}%` }}
  />
);

interface SeriesReadoutProps extends Spot {
  value: string;
  time: string;
}

/** crosshair + bubble beside the pointer */
export function SeriesReadout({ left, top, value, time }: SeriesReadoutProps) {
  return (
    <>
      <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-border-strong" style={{ left: `${left}%` }} />
      <SeriesDot left={left} top={top} />
      <div
        role="status"
        className={cn(
          "pointer-events-none absolute z-10 -translate-y-1/2 rounded-lg border border-border bg-surface-raised/95 px-2.5 py-1.5 whitespace-nowrap shadow-lg",
          left > FLIP_AT ? "-ml-3 -translate-x-full" : "ml-3",
        )}
        style={{ left: `${left}%`, top: `${Math.min(90, Math.max(10, top))}%` }}
      >
        <span className="block font-mono text-[11px] text-fg-muted">{time}</span>
        <span className="block font-mono text-[13px] font-medium text-fg tabular-nums">{value}</span>
      </div>
    </>
  );
}
