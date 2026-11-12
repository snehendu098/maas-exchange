import type { MarketConfig } from "@/shared/config/markets";
import { Enter } from "@/shared/ui/motion/enter";
import { AccountPanel } from "./account-panel/account-panel";
import { ChartPanel } from "./chart/chart-panel";
import { MarketHeader } from "./market-header/market-header";
import { OrderBookPanel } from "./order-book/order-book-panel";
import { OrderForm } from "./order-form/order-form";

/** [asset bar / chart | book / account] | 420px ticket. Keyed by market: no stale state. */
export function TradeScreen({ market }: { market: MarketConfig }) {
  return (
    <div
      key={market.symbol}
      className="grid flex-1 grid-cols-1 md:min-h-0 md:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden"
    >
      <Enter className="scrollbar-none flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto">
        <MarketHeader market={market} />
        <div className="flex shrink-0 flex-col border-b border-border lg:h-[540px] lg:flex-row xl:h-auto xl:min-h-[500px] xl:flex-1">
          <ChartPanel market={market} className="h-[460px] flex-none lg:h-auto lg:flex-1" />
          <OrderBookPanel
            market={market}
            className="h-[600px] shrink-0 border-t border-border lg:h-auto lg:w-[300px] lg:border-t-0 lg:border-l"
          />
        </div>
        <AccountPanel className="h-[300px] shrink-0" />
      </Enter>

      <OrderForm
        market={market}
        className="scrollbar-none flex min-w-0 flex-col border-t border-border xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l"
      />
    </div>
  );
}
