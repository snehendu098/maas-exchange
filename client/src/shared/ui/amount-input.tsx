"use client";

import { useId, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { SlideSwap } from "./motion/slide-swap";
import { TokenLogo, type TokenLogoAsset } from "./token-logo";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const CHIP = "flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-bg/60 pr-3.5 pl-2 text-[15px] font-semibold text-fg";

interface AmountInputProps {
  /** visible caption + accessible name */
  label: string;
  value: string;
  onValueChange?: (value: string) => void;
  /** token chip on the right */
  asset?: TokenLogoAsset;
  /** makes the chip a unit switch */
  assetToggle?: { label: string; onClick: () => void };
  /** right-hand line under the chip, e.g. a balance */
  hint?: ReactNode;
  onMax?: () => void;
  maxDisabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  size?: "md" | "lg";
  className?: string;
}

/** Amount well: caption, big figure, token chip, optional Max. */
export function AmountInput({
  label,
  value,
  onValueChange,
  asset,
  assetToggle,
  hint,
  onMax,
  maxDisabled,
  placeholder = "0",
  readOnly,
  size = "md",
  className,
}: AmountInputProps) {
  const id = useId();
  // only unit switches roll; static chips never change key
  const unit = assetToggle ? (asset?.symbol ?? "") : "";

  return (
    <div className={cn("rounded-xl bg-surface-raised/50 px-4 py-3 ring-1 ring-transparent transition-shadow focus-within:ring-border-strong", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] text-fg-muted">
          {label}
        </label>
        {hint && <span className="truncate text-xs text-fg-muted tabular-nums">{hint}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <SlideSwap swapKey={unit} className="min-w-0 flex-1">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            value={value}
            readOnly={readOnly}
            onChange={(e) => {
              const next = e.target.value.replace(",", ".");
              if (DECIMAL_INPUT.test(next)) onValueChange?.(next);
            }}
            className={cn(
              "min-w-0 flex-1 bg-transparent font-medium text-fg tabular-nums outline-none placeholder:text-fg-subtle",
              size === "lg" ? "text-3xl leading-tight" : "text-xl",
            )}
          />
        </SlideSwap>
        {onMax && (
          <button
            type="button"
            disabled={maxDisabled}
            onClick={onMax}
            className="rounded-full border border-border bg-bg/60 px-2.5 py-0.5 text-xs font-medium text-fg-secondary transition-colors enabled:hover:border-brand/50 enabled:hover:text-fg disabled:text-fg-subtle"
          >
            Max
          </button>
        )}
        {asset && assetToggle ? (
          <button
            type="button"
            onClick={assetToggle.onClick}
            aria-label={assetToggle.label}
            className={cn(CHIP, "focus-ring transition-colors hover:bg-surface-raised")}
          >
            <SlideSwap swapKey={unit}>
              <TokenLogo asset={asset} size={20} />
              {asset.symbol}
            </SlideSwap>
            <ArrowLeftRight className="size-3.5 text-fg-muted" strokeWidth={1.5} />
          </button>
        ) : (
          asset && (
            <span className={CHIP}>
              <TokenLogo asset={asset} size={20} />
              {asset.symbol}
            </span>
          )
        )}
      </div>
    </div>
  );
}
