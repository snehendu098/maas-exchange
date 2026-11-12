"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal } from "lucide-react";
import type { MarketConfig } from "@/shared/config/markets";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { useDismiss } from "@/shared/hooks/use-dismiss";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/icon-button";
import { Panel } from "@/shared/ui/panel";
import { TabBar } from "@/shared/ui/tab-bar";
import { FadeSwap } from "@/shared/ui/motion/fade-swap";
import { OrderBookView } from "./order-book-view";
import { RecentTradesView } from "./recent-trades-view";
import { DEFAULT_TRADE_FILTER, TradeFilterPopover, type TradeFilter } from "./trade-filter-popover";

type BookTab = "book" | "trades";

const TABS = [
  { value: "book", label: "Order book" },
  { value: "trades", label: "Trades" },
] as const;

export function OrderBookPanel({ market, className }: { market: MarketConfig; className?: string }) {
  const [tab, setTab] = useState<BookTab>("book");
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>(DEFAULT_TRADE_FILTER);
  const filter = useDisclosure();
  const filterRef = useRef<HTMLDivElement>(null);
  useDismiss(filterRef, filter.close, filter.isOpen);

  return (
    <Panel aria-label="Order book" className={cn("relative", className)}>
      <div ref={filterRef} className="relative z-10">
        <div className="relative min-h-12 border-b border-border">
          <TabBar options={TABS} value={tab} onChange={setTab} bordered={false} fill="equal" divided size="lg" className="h-12" />
          {tab === "trades" && (
            <IconButton label="Filter trades" active={filter.isOpen} onClick={filter.toggle} className="absolute top-1/2 right-2 z-[2] -translate-y-1/2">
              <SlidersHorizontal className="size-4" strokeWidth={1.5} />
            </IconButton>
          )}
        </div>

        <AnimatePresence>
          {tab === "trades" && filter.isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-x-2 top-full mt-1"
            >
              <TradeFilterPopover value={tradeFilter} onChange={setTradeFilter} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FadeSwap swapKey={tab}>{tab === "book" ? <OrderBookView market={market} /> : <RecentTradesView market={market} filter={tradeFilter} />}</FadeSwap>
    </Panel>
  );
}
