"use client";

import { useEffect, useState } from "react";
import { useNowSeconds } from "@/shared/hooks/use-now";
import { EmptyState } from "@/shared/ui/empty-state";
import { Panel, PanelHeader } from "@/shared/ui/panel";
import { TabBar } from "@/shared/ui/tab-bar";
import { Table, Th } from "@/shared/ui/table";
import { FadeSwap } from "@/shared/ui/motion/fade-swap";
import { useVaultPosition, useVaultState } from "../../hooks/use-vault";
import { useFundingHistory } from "../../hooks/use-vault-history";
import { MarketRow } from "./market-row";
import { PositionView } from "./position-view";

export type VaultTab = "markets" | "position";
type Tab = VaultTab;

const TABS = [
  { value: "markets", label: "Markets" },
  { value: "position", label: "Position" },
] as const satisfies ReadonlyArray<{ value: Tab; label: string }>;

/** Spot long + perp short per leg; FLAT legs sit in USDC. */
function MarketsTable() {
  const vault = useVaultState().data;
  const { summary } = useFundingHistory();
  const now = useNowSeconds();
  if (!vault) return <EmptyState className="min-h-[200px] flex-1">Loading…</EmptyState>;
  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-auto">
      <Table className="table-fixed">
        <thead>
          <tr>
            <Th className="w-1/5">Market</Th>
            <Th className="w-1/5 text-right">Weight</Th>
            <Th className="w-1/5">Mode</Th>
            <Th className="w-1/5 text-right">Hedge</Th>
            <Th className="w-1/5 text-right">Funding</Th>
          </tr>
        </thead>
        <tbody>
          {vault.legs.map((leg) => (
            <MarketRow key={leg.market} leg={leg} funding={summary?.[leg.market]} now={now} />
          ))}
          {/* end-of-list marker under the last leg */}
          <tr className="border-t border-border">
            <td colSpan={5} className="pt-7 pb-4 text-center text-xs text-fg-subtle">
              No more markets
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}

/** Markets | Position tabs under the chart. */
export function MarketsPanel({ className, initialTab = "markets" }: { className?: string; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // route kept alive between visits; effect reruns on each reveal, so ?view= wins
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reveal is the only signal
    if (initialTab !== "markets") setTab(initialTab);
  }, [initialTab]);
  const shares = useVaultPosition().position?.shares;
  const [seen, setSeen] = useState(shares);
  // deposit landed (shares grew) -> show it; first load / connect never switches
  if (shares !== seen) {
    setSeen(shares);
    if (seen !== undefined && shares !== undefined && shares > seen) setTab("position");
  }
  return (
    <Panel aria-label="Markets" className={className}>
      <PanelHeader className="pl-2 sm:pl-3">
        <TabBar aria-label="Vault view" options={TABS} value={tab} onChange={setTab} bordered={false} className="h-12" />
      </PanelHeader>
      <FadeSwap swapKey={tab}>{tab === "markets" ? <MarketsTable /> : <PositionView />}</FadeSwap>
    </Panel>
  );
}
