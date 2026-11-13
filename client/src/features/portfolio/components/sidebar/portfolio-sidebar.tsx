import type { CollateralMode } from "@/features/perp/components/collateral/collateral-modal";
import { Enter } from "@/shared/ui/motion/enter";
import type { Portfolio } from "../../hooks/use-portfolio";
import { AllocationSection } from "./allocation-section";
import { BalanceSection } from "./balance-section";
import { MarginSection } from "./margin-section";
import { RecordSection } from "./record-section";

/** Right column: balance, allocation, margin health, trade record. */
export function PortfolioSidebar({ p, onCollateral, className }: { p: Portfolio; onCollateral: (mode: CollateralMode) => void; className?: string }) {
  return (
    <Enter as="aside" delay={0.08} aria-label="Account" className={className}>
      <BalanceSection connected={p.connected} equity={p.equity} free={p.free} onCollateral={onCollateral} />
      <div className="divide-y divide-border border-y border-border">
        <AllocationSection total={p.allocation.total} slices={p.allocation.slices} connected={p.connected} />
        <MarginSection health={p.health} initial={p.initial} maintenance={p.maintenance} connected={p.connected} />
        <RecordSection record={p.record} bands={p.bands} closed={p.closed} />
      </div>
    </Enter>
  );
}
