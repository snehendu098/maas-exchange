"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { MarketConfig } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { formatSize } from "@/shared/lib/format";
import { PRICE_DECIMALS, decimalsForStep, formatPriceRaw, notional, sizeToNumber, usdcToNumber } from "@/shared/lib/units";
import { EmptyState } from "@/shared/ui/empty-state";
import { SlideSwap } from "@/shared/ui/motion/slide-swap";
import { SelectMenu } from "@/shared/ui/select-menu";
import { TokenLogo, USDC_ICON } from "@/shared/ui/token-logo";
import { useOrderBook } from "../../hooks/use-order-book";
import type { DepthLevel } from "../../lib/book";
import { priceDecimals } from "../../lib/market-format";
import { BOOK_GRID, OrderBookRow } from "./order-book-row";

type SizeUnit = "base" | "quote";

export function OrderBookView({ market }: { market: MarketConfig }) {
  const [group, setGroup] = useState<bigint | undefined>(undefined);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("base");
  const { view, tickSizes, groupSize, error } = useOrderBook(market, group);

  const groupDecimals = (g: bigint) => Math.max(priceDecimals(market), decimalsForStep(g, PRICE_DECIMALS));
  const dp = groupDecimals(groupSize);
  const toUnit = (size: bigint, price: bigint) => (sizeUnit === "base" ? sizeToNumber(size) : usdcToNumber(notional(size, price)));

  const maxTotal = Math.max(Number(view?.asks[0]?.total ?? 0n), Number(view?.bids.at(-1)?.total ?? 0n)) || 1;
  const tickOptions = tickSizes.map((tick) => ({ value: tick.toString(), label: formatPriceRaw(tick, groupDecimals(tick)) }));
  const unitLabel = sizeUnit === "base" ? market.symbol : "USDC";

  const renderRow = (side: "buy" | "sell", level: DepthLevel) => (
    <OrderBookRow
      key={level.price.toString()}
      side={side}
      price={formatPriceRaw(level.price, dp)}
      size={formatSize(toUnit(level.size, level.price))}
      total={formatSize(toUnit(level.total, level.price))}
      depth={Number(level.total) / maxTotal}
      unit={sizeUnit}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <SelectMenu
          label="Price grouping"
          size="sm"
          options={tickOptions}
          value={groupSize.toString()}
          onChange={(v) => setGroup(BigInt(v))}
          panelClassName="min-w-28"
        />
        <button
          type="button"
          onClick={() => setSizeUnit((u) => (u === "base" ? "quote" : "base"))}
          aria-label="Toggle size unit"
          className="focus-ring flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-raised"
        >
          <SlideSwap swapKey={sizeUnit} className="h-full">
            <TokenLogo asset={sizeUnit === "base" ? market : USDC_ICON} size={14} />
            {unitLabel}
          </SlideSwap>
          <ArrowLeftRight className="size-3 text-fg-muted" strokeWidth={1.5} />
        </button>
      </div>

      <div className={cn(BOOK_GRID, "label-mono h-7 shrink-0 text-[11px] text-fg-muted")}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {error ? (
        <EmptyState className="flex-1 text-down">Book unavailable: {error.message}</EmptyState>
      ) : !view ? (
        <EmptyState className="flex-1">Loading book…</EmptyState>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">{view.asks.map((l) => renderRow("sell", l))}</div>
          <div className="flex h-9 shrink-0 items-center justify-between border-y border-border bg-surface/60 px-4">
            <span className="text-[15px] font-medium tabular-nums">{view.mid !== null ? `$${formatPriceRaw(view.mid, dp)}` : "—"}</span>
            <span className="label-mono text-[11px] text-fg-muted">Mid</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{view.bids.map((l) => renderRow("buy", l))}</div>
        </div>
      )}
    </div>
  );
}
