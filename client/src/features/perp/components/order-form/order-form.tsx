"use client";

import type { MarketConfig } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { formatUsdcRaw } from "@/shared/lib/units";
import { AmountInput } from "@/shared/ui/amount-input";
import { Button, type ConfirmAction } from "@/shared/ui/button";
import { TabBar } from "@/shared/ui/tab-bar";
import { USDC_ICON } from "@/shared/ui/token-logo";
import { useWallet } from "@/features/wallet/hooks/use-wallet";
import { Enter } from "@/shared/ui/motion/enter";
import { useOrderForm } from "../../hooks/use-order-form";
import { fmtSize } from "../../lib/market-format";
import { AccountCard } from "../collateral/account-card";
import { LeverageChip } from "./leverage-chip";
import { OrderOptions } from "./order-options";
import { OrderSummary, SummaryRow } from "./order-summary";
import { QuickAmounts } from "./quick-amounts";

const SIDES = [
  { isBuy: true, label: "Buy / Long", on: "bg-up-soft text-up" },
  { isBuy: false, label: "Sell / Short", on: "bg-down-soft text-down" },
] as const;

const ORDER_KINDS = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
] as const;

/** Right column: leverage button, ticket, place order, account. */
export function OrderForm({ market, className }: { market: MarketConfig; className?: string }) {
  const form = useOrderForm(market);
  const wallet = useWallet();
  const { values, set, preview } = form;
  const usdcSize = values.sizeUnit === "usdc";
  const isLimit = values.kind === "limit";
  const action: ConfirmAction = form.isConnected
    ? {
        label: form.isSubmitting ? "Signing…" : (preview.error ?? "Place order"),
        variant: values.isBuy ? "up" : "down",
        disabled: Boolean(preview.error) || form.isSubmitting,
        onConfirm: form.submit,
      }
    : { label: "Connect Wallet", variant: "primary", onConfirm: () => void wallet.connect() };

  return (
    <Enter as="aside" delay={0.08} aria-label="Order form" className={className}>
      {/* h-16 / 84px = market header row, tab lines align */}
      <div className="flex h-16 shrink-0 border-b border-border lg:h-[84px]">
        <LeverageChip symbol={market.symbol} value={values.leverage} max={market.maxLeverage} onChange={(v) => set("leverage", v)} className="flex-1" />
      </div>

      <TabBar
        aria-label="Order type"
        options={ORDER_KINDS}
        value={values.kind}
        onChange={(v) => set("kind", v)}
        fill="equal"
        divided
        size="lg"
        className="h-12 shrink-0"
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div role="group" aria-label="Order side" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1">
          {SIDES.map((s) => {
            const on = values.isBuy === s.isBuy;
            return (
              <button
                key={s.label}
                type="button"
                aria-pressed={on}
                onClick={() => set("isBuy", s.isBuy)}
                className={cn("focus-ring h-9 rounded-full text-[13px] font-medium transition-colors", on ? s.on : "text-fg-muted hover:text-fg")}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <dl className="space-y-1.5 text-xs">
          <SummaryRow label="Available to trade">{form.isConnected ? `${formatUsdcRaw(form.available)} USDC` : "—"}</SummaryRow>
          <SummaryRow label="Current position" className={form.position > 0n ? "text-up" : form.position < 0n ? "text-down" : undefined}>
            {fmtSize(form.position, market)} {market.symbol}
          </SummaryRow>
        </dl>

        {isLimit && (
          <AmountInput
            label="Price (USDC)"
            value={values.price}
            onValueChange={(v) => set("price", v)}
            hint={
              <button type="button" disabled={!form.fillMid} onClick={form.fillMid} className="font-medium text-brand transition-opacity hover:opacity-80 disabled:opacity-40">
                Mid
              </button>
            }
          />
        )}

        <div className="space-y-2">
          <AmountInput
            label="Size"
            asset={usdcSize ? USDC_ICON : market}
            assetToggle={{ label: `Switch to ${usdcSize ? market.symbol : "USDC"}`, onClick: form.toggleUnit }}
            value={values.size}
            onValueChange={(v) => set("size", v)}
          />
          <p className="h-4 px-1 text-xs text-fg-muted tabular-nums">{form.counterpart}</p>
        </div>

        <QuickAmounts value={form.percent} disabled={!form.isConnected} onSelect={form.setFraction} />

        <OrderOptions
          reduceOnly={values.reduceOnly}
          onReduceOnly={(v) => set("reduceOnly", v)}
          tif={isLimit ? values.tif : undefined}
          onTif={(v) => set("tif", v)}
        />

        <Button variant={action.variant} size="lg" className="w-full" disabled={action.disabled} onClick={action.onConfirm}>
          {action.label}
        </Button>

        <OrderSummary market={market} mark={form.mark} preview={preview} />
      </div>

      <AccountCard account={form.account} available={form.available} />
    </Enter>
  );
}
