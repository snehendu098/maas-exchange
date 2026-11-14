"use client";

import { Enter } from "@/shared/ui/motion/enter";
import { VaultHeader } from "./header/vault-header";
import { VaultChartPanel } from "./history/chart-panel";
import { MarketsPanel, type VaultTab } from "./markets/markets-panel";
import { VaultSidebar } from "./ticket/vault-sidebar";

/** [asset bar / chart / markets] | 420px ticket + position. */
export function VaultScreen({ initialTab }: { initialTab?: VaultTab }) {
  return (
    <div className="grid flex-1 grid-cols-1 md:min-h-0 md:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
      <Enter className="scrollbar-none flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto">
        <div className="flex shrink-0 flex-col xl:min-h-full">
          <VaultHeader />
          <VaultChartPanel className="h-[460px] shrink-0 border-b border-border xl:h-auto xl:min-h-[400px] xl:flex-1" />
          <div className="grid shrink-0 border-b border-border lg:h-[300px]">
            <MarketsPanel initialTab={initialTab} />
          </div>
        </div>
      </Enter>

      <VaultSidebar className="scrollbar-none flex min-w-0 flex-col border-t border-border xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l" />
    </div>
  );
}
