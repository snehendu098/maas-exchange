"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatUsd } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import type { CollateralMode } from "@/features/perp/components/collateral/collateral-modal";

interface BalanceSectionProps {
  connected: boolean;
  equity: number;
  free: number;
  onCollateral: (mode: CollateralMode) => void;
}

/** Account value headline + collateral actions. */
export function BalanceSection({ connected, equity, free, onCollateral }: BalanceSectionProps) {
  const [hidden, setHidden] = useState(false);
  const EyeIcon = hidden ? EyeOff : Eye;
  const mask = (v: number) => (!connected ? "—" : hidden ? "••••••" : formatUsd(v));

  return (
    <section aria-label="Account value" className="space-y-5 px-4 py-6 sm:px-6">
      <div>
        <p className="label-mono flex items-center gap-2 text-fg-muted">
          Account value
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            aria-pressed={hidden}
            className="focus-ring rounded transition-colors hover:text-fg"
          >
            <EyeIcon className="size-3.5" strokeWidth={1.6} />
          </button>
        </p>
        <p className="mt-3 text-[34px] leading-none font-medium tracking-tight tabular-nums">{mask(equity)}</p>
        <p className="mt-2 text-xs text-fg-muted">
          Free to withdraw <span className="text-fg tabular-nums">{mask(free)}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={!connected} onClick={() => onCollateral("deposit")}>
          Deposit
        </Button>
        <Button size="lg" variant="secondary" disabled={!connected} onClick={() => onCollateral("withdraw")}>
          Withdraw
        </Button>
      </div>
    </section>
  );
}
