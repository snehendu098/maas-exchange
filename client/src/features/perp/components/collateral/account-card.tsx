"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import type { Account } from "../../api/types";
import { useTrader } from "../../hooks/use-user-data";
import { CollateralModal, type CollateralMode } from "./collateral-modal";

/** Perp margin account: deposit / withdraw. Summary stats live on Portfolio. */
export function AccountCard({ account, available }: { account?: Account; available: bigint }) {
  const [modal, setModal] = useState<CollateralMode | null>(null);
  const trader = useTrader();

  const collateral = account ? BigInt(account.collateral) : 0n;
  const withdrawable = collateral < available ? collateral : available;

  return (
    <Panel aria-label="Account" className="border-t border-border">
      <PanelHeader title="Account" />
      <div className="px-4 pt-4 pb-5 sm:px-6">
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!trader} onClick={() => setModal("deposit")}>
            Deposit
          </Button>
          <Button variant="outline" disabled={!trader} onClick={() => setModal("withdraw")}>
            Withdraw
          </Button>
        </div>
      </div>

      <CollateralModal open={modal !== null} initialMode={modal ?? "deposit"} withdrawable={withdrawable} onClose={() => setModal(null)} />
    </Panel>
  );
}
