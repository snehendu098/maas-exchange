import type { ReactNode } from "react";
import { dayTick } from "@/shared/lib/chart/axis-time";

export const CHART_MARGIN = { top: 16, right: 16, left: 4, bottom: 8 };
export const CHART_GRID = { vertical: false, strokeDasharray: "3 3", stroke: "var(--color-border)" } as const;
const TICK = { fill: "var(--color-fg-muted)", fontSize: 11 };
export const X_AXIS = { dataKey: "time", tickLine: false, axisLine: false, tick: TICK, tickFormatter: dayTick, minTickGap: 48 } as const;
export const Y_AXIS = { tickLine: false, axisLine: false, tick: TICK, width: 72, domain: ["auto", "auto"] } as const;
export const CHART_FILL = { width: "100%", height: "100%" } as const;

export const statusOf = (q: { isLoading: boolean; error: unknown }) =>
  q.error ? "Gateway unreachable" : q.isLoading ? "Loading…" : undefined;

/** fills the panel body; status overlay while loading / on error */
export function ChartFrame({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      {children}
      {status && <div className="absolute inset-0 flex items-center justify-center bg-bg/80 text-sm text-fg-muted">{status}</div>}
    </div>
  );
}
