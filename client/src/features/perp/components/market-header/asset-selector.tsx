"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { MarketConfig } from "@/shared/config/markets";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { useDismiss } from "@/shared/hooks/use-dismiss";
import { cn } from "@/shared/lib/cn";
import { TokenLogo } from "@/shared/ui/token-logo";
import { WatchlistStar } from "@/features/watchlist/watchlist-star";
import { MarketSelectorPanel } from "../market-selector/market-selector-panel";

/** Market identity that opens the market picker. */
export function AssetSelector({ market, className }: { market: MarketConfig; className?: string }) {
  const { isOpen, toggle, close } = useDisclosure();
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, close, isOpen);

  return (
    <div ref={rootRef} className={cn("relative items-center", className)}>
      <WatchlistStar symbol={market.symbol} className="pl-5" />
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`${market.symbol}-PERP, switch market`}
        className={cn(
          "flex h-full min-h-16 min-w-0 items-center gap-3.5 px-4 transition-colors lg:pr-7",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
          isOpen ? "bg-surface" : "hover:bg-surface",
        )}
      >
        <TokenLogo asset={market} size={36} />
        <span className="flex flex-col items-start">
          <span className="text-xl leading-tight">{market.symbol}-PERP</span>
          <span className="font-mono text-[11px] text-fg-muted">
            {market.name} · {market.maxLeverage}x
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-muted transition-transform", isOpen && "rotate-180")} strokeWidth={1.5} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full left-4 z-50 mt-2 origin-top-left"
          >
            <MarketSelectorPanel onSelect={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
