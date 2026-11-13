"use client";

import { useState } from "react";
import { USDC_DECIMALS, formatUsdcRaw, tryParse } from "@/shared/lib/units";
import { AmountInput } from "@/shared/ui/amount-input";
import { Button } from "@/shared/ui/button";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { USDC_ICON } from "@/shared/ui/token-logo";
import { useCollateral } from "../../hooks/use-collateral";

export type CollateralMode = "deposit" | "withdraw";

const MODES = [
  { value: "deposit", label: "Deposit" },
  { value: "withdraw", label: "Withdraw" },
] as const;

interface CollateralFormProps {
  initialMode: CollateralMode;
  /** withdrawable, USDC 1e6 */
  withdrawable: bigint;
  onDone: () => void;
}

/** Perp margin deposit / withdraw. */
export function CollateralForm({ initialMode, withdrawable, onDone }: CollateralFormProps) {
  const [mode, setMode] = useState<CollateralMode>(initialMode);
  const [amount, setAmount] = useState("");
  const { walletBalance = 0n, isPending, run } = useCollateral();

  const max = mode === "deposit" ? walletBalance : withdrawable;
  const raw = tryParse(amount, USDC_DECIMALS);
  const error = raw === null || raw === 0n ? "Enter an amount" : raw > max ? "Exceeds balance" : null;

  const submit = async () => {
    if (raw === null || error) return;
    const ok = await run({ action: mode, amount: raw }).then(
      () => true,
      () => false,
    );
    if (ok) onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl aria-label="Collateral action" layout="fill" options={MODES} value={mode} onChange={setMode} />
      <AmountInput
        label="Amount"
        size="lg"
        asset={USDC_ICON}
        value={amount}
        onValueChange={setAmount}
        hint={`${mode === "deposit" ? "Wallet" : "Withdrawable"} ${formatUsdcRaw(max)}`}
        onMax={() => setAmount(formatUsdcRaw(max, 6).replaceAll(",", ""))}
      />
      <Button size="lg" className="w-full" disabled={Boolean(error) || isPending} onClick={submit}>
        {isPending ? "Confirming…" : (error ?? (mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"))}
      </Button>
    </div>
  );
}
