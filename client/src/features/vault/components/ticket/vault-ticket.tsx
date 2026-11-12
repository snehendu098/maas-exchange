"use client";

import { formatUsdcRaw } from "@/shared/lib/units";
import { AmountInput } from "@/shared/ui/amount-input";
import { Button, type ConfirmAction } from "@/shared/ui/button";
import { TabBar } from "@/shared/ui/tab-bar";
import { USDC_ICON } from "@/shared/ui/token-logo";
import { useWallet } from "@/features/wallet/hooks/use-wallet";
import { useVaultForm, type VaultAction } from "../../hooks/use-vault-form";
import { DepositSummary, WithdrawSummary } from "./action-summary";
import { VaultHowItWorks } from "../info/how-it-works";
import { QueuedRequests } from "./queued-requests";

const ACTIONS = [
  { value: "deposit", label: "Deposit" },
  { value: "withdraw", label: "Withdraw" },
] as const satisfies ReadonlyArray<{ value: VaultAction; label: string }>;

type VaultForm = ReturnType<typeof useVaultForm>;

function ctaLabel(form: VaultForm) {
  const isDeposit = form.action === "deposit";
  if (form.isSubmitting) return isDeposit ? "Depositing…" : "Withdrawing…";
  return form.error ?? (isDeposit ? "Deposit" : "Withdraw");
}

/** Right ticket: deposit/withdraw tabs, amount, breakdown, confirm. */
export function VaultTicket() {
  const form = useVaultForm();
  const wallet = useWallet();
  const isDeposit = form.action === "deposit";
  const balance = isDeposit ? form.position?.walletUsdc : form.positionValue;

  const action: ConfirmAction = form.isConnected
    ? { label: ctaLabel(form), variant: "primary", disabled: Boolean(form.error) || form.isSubmitting, onConfirm: form.submit }
    : { label: "Connect Wallet", variant: "primary", onConfirm: () => void wallet.connect() };

  return (
    <section aria-label="Deposit or withdraw" className="flex flex-col">
      <TabBar
        aria-label="Vault action"
        options={ACTIONS}
        value={form.action}
        onChange={form.setAction}
        accent="brand"
        fill="equal"
        size="lg"
        divided
        className="h-16 shrink-0 lg:h-[84px]"
      />

      <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <VaultHowItWorks />
        <AmountInput
          label={isDeposit ? "Amount" : "Amount (position value)"}
          size="lg"
          asset={USDC_ICON}
          value={form.amount}
          onValueChange={form.setAmount}
          hint={balance !== undefined && `${isDeposit ? "Wallet" : "Position"} ${formatUsdcRaw(balance)}`}
          onMax={form.isConnected ? form.setMax : undefined}
          maxDisabled={!balance}
        />

        {isDeposit ? <DepositSummary preview={form.deposit} vault={form.vault} /> : <WithdrawSummary preview={form.withdraw} vault={form.vault} />}

        <Button variant={action.variant} size="lg" className="w-full" disabled={action.disabled} onClick={action.onConfirm}>
          {action.label}
        </Button>

        <QueuedRequests />
      </div>
    </section>
  );
}
