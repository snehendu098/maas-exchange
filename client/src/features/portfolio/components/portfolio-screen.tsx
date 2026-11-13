"use client";

import { useState } from "react";
import { AccountPanel } from "@/features/perp/components/account-panel/account-panel";
import type { CollateralMode } from "@/features/perp/components/collateral/collateral-form";
import { Enter } from "@/shared/ui/motion/enter";
import { VaultPositionTable } from "@/features/vault/components/position/vault-position-table";
import { useVaultHolding } from "@/features/vault/hooks/use-vault-holding";
import { usePortfolio } from "../hooks/use-portfolio";
import { CollateralModal } from "@/features/perp/components/collateral/collateral-modal";
import { PortfolioHeader } from "./header/portfolio-header";
import { PnlPanel } from "./pnl/pnl-panel";
import { PortfolioSidebar } from "./sidebar/portfolio-sidebar";

/** Portfolio: same frame as trade / vault, account sidebar on the right. */
export function PortfolioScreen() {
  const p = usePortfolio();
  const [modal, setModal] = useState<CollateralMode | null>(null);
  const vault = useVaultHolding();

  return (
    <div className="grid flex-1 grid-cols-1 md:min-h-0 md:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
      <Enter className="scrollbar-none flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto">
        <PortfolioHeader p={p} />
        <PnlPanel events={p.events} unrealized={p.unrealizedRaw} connected={p.connected} className="h-[420px] shrink-0 border-b border-border xl:h-auto xl:min-h-[380px] xl:flex-1" />
        <AccountPanel className="h-[360px] shrink-0" extraPositions={vault ? { count: 1, table: <VaultPositionTable holding={vault} /> } : undefined} />
      </Enter>
      <PortfolioSidebar
        p={p}
        onCollateral={setModal}
        className="scrollbar-none flex min-w-0 flex-col border-t border-border xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l"
      />
      <CollateralModal open={modal !== null} initialMode={modal ?? "deposit"} withdrawable={p.withdrawableRaw} onClose={() => setModal(null)} />
    </div>
  );
}
