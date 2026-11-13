"use client";

import { SegmentedControl } from "@/shared/ui/segmented-control";
import type { TradeSide } from "../../lib/side";

export interface TradeFilter {
  side: "all" | TradeSide;
  /** min notional USD, 0 = off */
  minNotional: number;
}

export const DEFAULT_TRADE_FILTER: TradeFilter = { side: "all", minNotional: 0 };

const SIDE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buys" },
  { value: "sell", label: "Sells" },
] as const;

const SIZE_PRESETS = [
  { value: "0", label: "All" },
  { value: "100", label: "$100" },
  { value: "1000", label: "$1K" },
  { value: "10000", label: "$10K" },
] as const;

function FilterLabel({ children }: { children: string }) {
  return <p className="label-mono mb-2 text-fg-muted">{children}</p>;
}

export function TradeFilterPopover({ value, onChange }: { value: TradeFilter; onChange: (filter: TradeFilter) => void }) {
  const presetValue = SIZE_PRESETS.some((p) => Number(p.value) === value.minNotional) ? String(value.minNotional) : "";

  return (
    <div
      role="dialog"
      aria-label="Trade filters"
      className="rounded-xl border border-border bg-surface p-3 shadow-xl shadow-black/50"
    >
      <FilterLabel>Side</FilterLabel>
      <SegmentedControl
        aria-label="Trade side"
        size="sm"
        layout="fill"
        options={SIDE_OPTIONS}
        value={value.side}
        onChange={(side) => onChange({ ...value, side })}
      />

      <div className="mt-4">
        <FilterLabel>Min size</FilterLabel>
        <SegmentedControl
          aria-label="Minimum trade size"
          size="sm"
          layout="fill"
          options={SIZE_PRESETS}
          value={presetValue as (typeof SIZE_PRESETS)[number]["value"]}
          onChange={(v) => onChange({ ...value, minNotional: Number(v) })}
        />
        <label className="field-3d mt-2 flex h-9 items-center gap-1 rounded-xl bg-surface-raised/50 px-3 text-[13px] text-fg-muted">
          <span>$</span>
          <input
            inputMode="decimal"
            placeholder="Custom"
            value={presetValue ? "" : String(value.minNotional)}
            onChange={(e) => {
              const parsed = Number(e.target.value.replace(/[^0-9.]/g, ""));
              onChange({ ...value, minNotional: Number.isFinite(parsed) ? parsed : 0 });
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      </div>
    </div>
  );
}
