import type { ReactNode } from "react";
import type { MarketConfig } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { formatNumber } from "@/shared/lib/format";
import { PRICE_DECIMALS, formatRaw, formatUsdcRaw } from "@/shared/lib/units";
import { priceDecimals } from "../../lib/market-format";
import type { OrderPreview } from "../../lib/order-preview";

export function SummaryRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="min-w-0 truncate text-fg-muted">{label}</dt>
      <dd className={cn("shrink-0 text-fg tabular-nums", className)}>{children}</dd>
    </div>
  );
}

export const Dash = () => <span className="text-fg-muted">—</span>;

export function OrderSummary({ market, mark, preview, className }: { market: MarketConfig; mark: bigint | null; preview: OrderPreview; className?: string }) {
  const has = preview.notional > 0n;
  return (
    <dl className={cn("space-y-2.5 text-sm", className)}>
      <SummaryRow label="Mark price">{mark ? `$${formatRaw(mark, PRICE_DECIMALS, priceDecimals(market))}` : <Dash />}</SummaryRow>
      <SummaryRow label="Liquidation price">{preview.liqPrice ? `$${formatNumber(preview.liqPrice, 2)}` : <Dash />}</SummaryRow>
      <SummaryRow label="Order value">{has ? `$${formatUsdcRaw(preview.notional)}` : <Dash />}</SummaryRow>
      <SummaryRow label="Margin required">{has ? `$${formatUsdcRaw(preview.margin)}` : <Dash />}</SummaryRow>
      <SummaryRow label="Fees (maker / taker)">
        {formatNumber(market.makerFeeBps / 100, 2)}% / {formatNumber(market.takerFeeBps / 100, 2)}%
      </SummaryRow>
    </dl>
  );
}
