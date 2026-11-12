import type { VaultPosition, VaultState } from "../api/types";
import { toAssets, toShares, toSharesUp } from "./share-math";
import { splitWithdraw, type WithdrawSplit } from "./withdraw-math";

export interface DepositPreview {
  shares: bigint;
  error: string | null;
}

export interface WithdrawPreview {
  shares: bigint;
  split: WithdrawSplit | null;
  error: string | null;
}

/** amount null = unparsable input */
export function previewDeposit(amount: bigint | null, vault?: VaultState, position?: VaultPosition): DepositPreview {
  if (amount === null) return { shares: 0n, error: "Invalid amount" };
  if (amount === 0n) return { shares: 0n, error: "Enter an amount" };
  if (!vault) return { shares: 0n, error: "Loading vault…" };
  const shares = toShares(amount, vault.totalAssets, vault.totalSupply);
  if (position && amount > position.walletUsdc) return { shares, error: "Insufficient USDC" };
  if (shares === 0n) return { shares, error: "Amount too small" };
  return { shares, error: null };
}

/** max = redeem every free share, no ceil dust */
export function previewWithdraw(
  amount: bigint | null,
  max: boolean,
  vault?: VaultState,
  position?: VaultPosition,
): WithdrawPreview {
  const empty = { shares: 0n, split: null };
  if (!max && amount === null) return { ...empty, error: "Invalid amount" };
  if (!max && amount === 0n) return { ...empty, error: "Enter an amount" };
  if (!vault || !position) return { ...empty, error: "Loading vault…" };
  const shares = max ? position.shares : toSharesUp(amount ?? 0n, vault.totalAssets, vault.totalSupply);
  if (shares === 0n) return { ...empty, error: max ? "No shares" : "Amount too small" };
  const gross = toAssets(shares, vault.totalAssets, vault.totalSupply);
  const split = splitWithdraw(gross, vault.idle, vault.config.withdrawFeeBps);
  if (shares > position.shares) return { shares, split, error: "Insufficient shares" };
  return { shares, split, error: null };
}
