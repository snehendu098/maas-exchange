"use client";

import { Panel, PanelHeader } from "@/shared/ui/panel";
import { FundingChart, FundingLegend } from "./funding-chart";

/** Hourly funding prints per vault market, 7d. */
export function VaultChartPanel({ className }: { className?: string }) {
  return (
    <Panel aria-label="Funding history" className={className}>
      <PanelHeader title="Funding" actions={<FundingLegend />} />
      <div className="relative min-h-0 flex-1">
        <FundingChart />
      </div>
    </Panel>
  );
}
