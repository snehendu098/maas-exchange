"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { EmptyState } from "@/shared/ui/empty-state";
import { PanelHeader } from "@/shared/ui/panel";
import { TabBar } from "@/shared/ui/tab-bar";
import { FadeSwap } from "@/shared/ui/motion/fade-swap";
import { useMarketStats } from "../../hooks/use-market-data";
import { useOrderRejections } from "../../hooks/use-order-actions";
import { useFills, useFunding, useOpenOrders, usePerpAccount, usePositions, useTrader } from "../../hooks/use-user-data";
import { FillsTable, FundingTable } from "./history-tables";
import { OpenOrdersTable } from "./open-orders-table";
import { PositionsTable } from "./positions-table";

type PanelTab = "positions" | "orders" | "fills" | "funding";

const EMPTY: Record<PanelTab, string> = {
  positions: "No open positions",
  orders: "No open orders",
  fills: "No fills yet",
  funding: "No funding payments yet",
};

interface Query<T> {
  data?: T[];
  error: Error | null;
  isLoading: boolean;
}

const MESSAGE = "flex-1 pt-6 pb-10";

function TabBody<T>({ q, tab, children }: { q: Query<T>; tab: PanelTab; children: (rows: T[]) => ReactNode }) {
  if (q.error) return <EmptyState className={cn(MESSAGE, "text-down")}>Gateway error: {q.error.message}</EmptyState>;
  if (q.isLoading) return <EmptyState className={MESSAGE}>Loading…</EmptyState>;
  if (!q.data?.length) return <EmptyState className={MESSAGE}>{EMPTY[tab]}</EmptyState>;
  return <>{children(q.data)}</>;
}

interface ExtraPositions {
  count: number;
  /** rendered under perp positions, e.g. the vault stake */
  table: ReactNode;
}

/** Positions / open orders / fills / funding for the connected trader. */
export function AccountPanel({ className, extraPositions }: { className?: string; extraPositions?: ExtraPositions }) {
  const [tab, setTab] = useState<PanelTab>("positions");
  const trader = useTrader();
  useOrderRejections(trader);
  const positions = usePositions(trader);
  const orders = useOpenOrders(trader);
  const fills = useFills(trader);
  const funding = useFunding(trader);
  const account = usePerpAccount(trader).data;
  const { byId } = useMarketStats();

  const count = (n?: number) => (n ? ` (${n})` : "");
  const extra = extraPositions?.count ? extraPositions : null;
  // with an extra stake, skip the empty perp message
  const showPerp = !extra || Boolean(positions.data?.length) || Boolean(positions.error) || positions.isLoading;
  const tabs = [
    { value: "positions", label: `Positions${count((positions.data?.length ?? 0) + (extra?.count ?? 0))}` },
    { value: "orders", label: `Open orders${count(orders.data?.length)}` },
    { value: "fills", label: "Fills" },
    { value: "funding", label: "Funding" },
  ] as const satisfies ReadonlyArray<{ value: PanelTab; label: string }>;

  return (
    <section aria-label="Account activity" className={cn("flex min-h-0 flex-col", className)}>
      <PanelHeader>
        <TabBar options={tabs} value={tab} onChange={setTab} bordered={false} className="-ml-3.5 self-stretch" size="lg" />
      </PanelHeader>
      <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-auto">
        <FadeSwap swapKey={tab}>
          {!trader ? (
            <EmptyState className={MESSAGE}>Connect wallet to view {tabs.find((t) => t.value === tab)?.label.toLowerCase()}</EmptyState>
          ) : tab === "positions" ? (
            <>
              {showPerp && (
                <TabBody q={positions} tab={tab}>
                  {(rows) => <PositionsTable positions={rows} stats={byId} account={account} />}
                </TabBody>
              )}
              {extra?.table}
            </>
          ) : tab === "orders" ? (
            <TabBody q={orders} tab={tab}>
              {(rows) => <OpenOrdersTable orders={rows} />}
            </TabBody>
          ) : tab === "fills" ? (
            <TabBody q={fills} tab={tab}>
              {(rows) => <FillsTable fills={rows} />}
            </TabBody>
          ) : (
            <TabBody q={funding} tab={tab}>
              {(rows) => <FundingTable payments={rows} />}
            </TabBody>
          )}
        </FadeSwap>
      </div>
    </section>
  );
}
