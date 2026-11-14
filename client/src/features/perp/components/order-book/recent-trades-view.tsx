"use client";

import { useMemo, useState } from "react";
import type { MarketConfig } from "@/shared/config/markets";
import { useNowSeconds } from "@/shared/hooks/use-now";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatSignificant, truncateAddress } from "@/shared/lib/format";
import { notional, sizeToNumber, usdcToNumber } from "@/shared/lib/units";
import { useRecentTrades } from "../../hooks/use-market-data";
import { fmtPrice } from "../../lib/market-format";
import { toTradeSide } from "../../lib/side";
import type { TradeFilter } from "./trade-filter-popover";

// sqrt(size) bars so whales stand out
const MAX_BAR_WIDTH = 0.56;
const GRID = "grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-2 px-4";

export function RecentTradesView({ market, filter }: { market: MarketConfig; filter: TradeFilter }) {
  const { data: trades = [], error } = useRecentTrades(market.id);
  const [sizeInUsd, setSizeInUsd] = useState(false);
  const now = useNowSeconds();

  const visible = useMemo(
    () =>
      trades.filter(
        (t) =>
          (filter.side === "all" || toTradeSide(t.takerSide) === filter.side) &&
          usdcToNumber(notional(t.size, t.price)) >= filter.minNotional,
      ),
    [trades, filter],
  );
  const maxSize = useMemo(() => Math.max(1e-9, ...trades.map((t) => sizeToNumber(t.size))), [trades]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(GRID, "label-mono mt-2 h-7 shrink-0 text-[11px] text-fg-muted")}>
        <span>Price</span>
        <button
          type="button"
          onClick={() => setSizeInUsd((v) => !v)}
          className="label-mono text-right text-[11px] whitespace-nowrap transition-colors hover:text-fg"
        >
          Size <span className="text-fg-secondary underline underline-offset-2">{sizeInUsd ? "USDC" : market.symbol}</span>
        </button>
        <span>Trader</span>
        <span className="text-right">Age</span>
      </div>

      <ul className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {visible.map((t) => {
          const isBuy = t.takerSide === "SIDE_BUY";
          const base = sizeToNumber(t.size);
          const size = sizeInUsd ? usdcToNumber(notional(t.size, t.price)) : base;
          return (
            <li key={t.tradeId} className={cn(GRID, "relative h-6 font-mono text-xs tabular-nums")}>
              <span
                aria-hidden
                style={{ width: `${Math.sqrt(base / maxSize) * MAX_BAR_WIDTH * 100}%` }}
                className={cn("absolute inset-y-px left-0", isBuy ? "bg-up-depth" : "bg-down-depth")}
              />
              <span className={cn("relative", isBuy ? "text-up" : "text-down")}>${fmtPrice(t.price, market)}</span>
              <span className="relative text-right text-fg">{formatSignificant(size)}</span>
              <span className="relative text-fg-secondary">{truncateAddress(t.taker, 4, 3)}</span>
              <span className="relative text-right text-fg-muted" suppressHydrationWarning>
                {now === 0 ? "" : formatAge(Math.max(0, now - t.time / 1000))}
              </span>
            </li>
          );
        })}
        {error && <li className="pt-10 text-center text-[13px] text-down">Trades unavailable: {error.message}</li>}
        {!error && visible.length === 0 && <li className="pt-10 text-center text-[13px] text-fg-muted">No trades match your filters</li>}
      </ul>
    </div>
  );
}
