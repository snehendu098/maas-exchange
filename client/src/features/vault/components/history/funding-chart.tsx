"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { getMarket } from "@/shared/config/markets";
import { TokenLogo } from "@/shared/ui/token-logo";
import { formatFunding } from "@/features/perp/lib/market-format";
import { useFundingHistory } from "../../hooks/use-vault-history";
import { fundingSeries } from "../../lib/chart-data";
import { CHART_FILL, CHART_GRID, CHART_MARGIN, ChartFrame, X_AXIS, Y_AXIS, statusOf } from "./chart-frame";
import { dayStarts } from "@/shared/lib/chart/axis-time";
import { mergeSeries } from "./chart-rows";
import { ChartTooltip } from "./chart-tooltip";

function useFundingSeries() {
  const funding = useFundingHistory();
  const byMarket = fundingSeries(funding.data ?? []);
  return { funding, byMarket, markets: [...byMarket.keys()] };
}

export function FundingLegend() {
  const { markets } = useFundingSeries();
  return (
    <ul className="flex flex-wrap gap-3 font-mono text-[11px] text-fg-muted">
      {markets.map((id) => {
        const m = getMarket(id);
        return (
          <li key={id} className="flex items-center gap-1.5">
            {m && <TokenLogo asset={m} size={14} />}
            {id}
          </li>
        );
      })}
    </ul>
  );
}

/** hourly funding prints per market */
export function FundingChart() {
  const { funding, byMarket, markets } = useFundingSeries();
  const rows = mergeSeries(byMarket);
  return (
    <ChartFrame status={statusOf(funding)}>
      <LineChart responsive data={rows} margin={CHART_MARGIN} style={CHART_FILL}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis {...X_AXIS} ticks={dayStarts(rows.map((r) => r.time))} interval="preserveStartEnd" />
        <YAxis {...Y_AXIS} tickFormatter={formatFunding} />
        <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeDasharray="4 4" />
        <Tooltip content={(p) => <ChartTooltip {...p} format={formatFunding} />} />
        {markets.map((m) => (
          <Line key={m} type="monotone" dataKey={m} name={m} stroke={getMarket(m)?.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}
