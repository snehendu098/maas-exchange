import { memo } from "react";
import { cn } from "@/shared/lib/cn";
import { SlideSwap } from "@/shared/ui/motion/slide-swap";
import type { TradeSide } from "../../lib/side";

interface OrderBookRowProps {
  side: TradeSide;
  price: string;
  size: string;
  total: string;
  /** depth vs deepest side, 0..1 */
  depth: number;
  /** size unit; size + total roll when it flips */
  unit: string;
}

export const BOOK_GRID = "grid grid-cols-[1fr_1fr_1fr] items-center gap-2 px-4";

export const OrderBookRow = memo(function OrderBookRow({ side, price, size, total, depth, unit }: OrderBookRowProps) {
  const isBid = side === "buy";
  return (
    <div className={cn(BOOK_GRID, "relative h-6 shrink-0 font-mono text-xs tabular-nums hover:bg-surface")}>
      <span
        aria-hidden
        style={{ width: `${Math.min(depth, 1) * 100}%` }}
        className={cn("absolute inset-y-px right-0", isBid ? "bg-up-depth" : "bg-down-depth")}
      />
      <span className={cn("relative", isBid ? "text-up" : "text-down")}>{price}</span>
      <SlideSwap swapKey={unit} align="end" className="text-fg">
        {size}
      </SlideSwap>
      <SlideSwap swapKey={unit} align="end" className="text-fg-secondary">
        {total}
      </SlideSwap>
    </div>
  );
});
