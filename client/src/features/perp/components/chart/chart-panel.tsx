"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { MarketConfig } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { EmptyState } from "@/shared/ui/empty-state";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import type { CandleInterval } from "../../api/types";
import { useCandles } from "../../hooks/use-market-data";

const CandleChart = dynamic(() => import("./candle-chart"), { ssr: false });

const INTERVALS = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
] as const satisfies ReadonlyArray<{ value: CandleInterval; label: string }>;

/** Candles from our own fills (mark/last), not the oracle index. */
export function ChartPanel({ market, className }: { market: MarketConfig; className?: string }) {
  const [iv, setIv] = useState<CandleInterval>("5m");
  const { data, isLoading, error } = useCandles(market.id, iv);
  return (
    <Panel aria-label={`${market.symbol} chart`} className={cn("flex-1", className)}>
      <PanelHeader title="Price" actions={<SegmentedControl aria-label="Interval" size="sm" options={INTERVALS} value={iv} onChange={setIv} />} />
      <div className="relative min-h-0 flex-1">
        {data?.length ? (
          <CandleChart market={market} candles={data} />
        ) : (
          <EmptyState className="absolute inset-0">{isLoading ? "Loading…" : error ? "Chart unavailable" : "No trades yet"}</EmptyState>
        )}
      </div>
    </Panel>
  );
}
