"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/shared/lib/errors";
import { USDC_DECIMALS, formatUnits, formatUsdcRaw, tryParse } from "@/shared/lib/units";
import { toast } from "@/shared/ui/toast/toast-store";
import type { VaultApi } from "../api/types";
import { toAssets } from "../lib/share-math";
import { formatShares } from "../lib/vault-format";
import { previewDeposit, previewWithdraw } from "../lib/vault-preview";
import { vaultKeys } from "./query-keys";
import { useVaultPosition, useVaultState } from "./use-vault";
import { useVaultApi } from "./use-vault-api";

export type VaultAction = "deposit" | "withdraw";

const WAIT_MS = 3_000;
const WAIT_MAX = 100; // ~5 min, then the position view keeps showing it

/** queued part: wait until the keeper fulfills (request leaves contract state) */
async function waitFulfilled(api: VaultApi, owner: string, id: bigint) {
  for (let i = 0; i < WAIT_MAX; i++) {
    await new Promise((r) => setTimeout(r, WAIT_MS));
    const pos = await api.getPosition(owner);
    if (!pos.requests.some((r) => r.id === id)) return true;
  }
  return false;
}

/** Deposit / withdraw box: amount in USDC -> live preview -> submit. */
export function useVaultForm() {
  const api = useVaultApi();
  const qc = useQueryClient();
  const vault = useVaultState().data;
  const { address, position } = useVaultPosition();
  const [action, setActionState] = useState<VaultAction>("deposit");
  const [amount, setAmountState] = useState("");
  const [max, setMaxFlag] = useState(false);

  const parsed = amount.trim() === "" ? 0n : tryParse(amount, USDC_DECIMALS);
  const deposit = previewDeposit(parsed, vault, position);
  const withdraw = previewWithdraw(parsed, max, vault, position);
  const error = action === "deposit" ? deposit.error : withdraw.error;

  const reset = () => {
    setAmountState("");
    setMaxFlag(false);
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: vaultKeys.state });
    void qc.invalidateQueries({ queryKey: vaultKeys.position(address) });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      if (error || parsed === null) throw new Error(error ?? "Invalid amount");
      if (action === "deposit") {
        await api.deposit(address, parsed);
        return { kind: "deposit" as const, assets: parsed, shares: deposit.shares };
      }
      const net = withdraw.split?.net ?? 0n;
      const res = await api.redeem(withdraw.shares);
      const done = res !== undefined && (res.requestId === null || (await waitFulfilled(api, address, res.requestId)));
      return { kind: "withdraw" as const, net, done };
    },
    onSuccess: (out) => {
      if (out.kind === "deposit") toast.success(`Deposited ${formatUsdcRaw(out.assets)} USDC`, `~${formatShares(out.shares)} shares minted`);
      else if (out.done) toast.success(`Withdrew ${formatUsdcRaw(out.net)} USDC`);
      else toast.info("Withdraw still processing", `${formatUsdcRaw(out.net)} USDC arrives shortly`);
      reset();
    },
    onError: (e) => toast.error(action === "deposit" ? "Deposit failed" : "Withdraw failed", errorMessage(e)),
    onSettled: refresh,
  });

  const positionValue = vault && position ? toAssets(position.shares, vault.totalAssets, vault.totalSupply) : undefined;

  return {
    action,
    amount,
    vault,
    position,
    positionValue,
    deposit,
    withdraw,
    error,
    isConnected: Boolean(address),
    isSubmitting: submit.isPending || Boolean(position?.requests.some((r) => r.status === "PENDING")),
    setAction: (a: VaultAction) => {
      setActionState(a);
      reset();
    },
    setAmount: (v: string) => {
      setAmountState(v);
      setMaxFlag(false);
    },
    setMax: () => {
      if (action === "deposit" && position) setAmountState(formatUnits(position.walletUsdc, USDC_DECIMALS));
      if (action === "withdraw" && positionValue !== undefined) {
        setAmountState(formatUnits(positionValue, USDC_DECIMALS));
        setMaxFlag(true);
      }
    },
    submit: () => submit.mutate(),
  };
}
