import type { VaultPosition, VaultState } from "../api/types";
import { sharePrice, toAssets } from "./share-math";

export interface VaultHolding {
  shares: bigint;
  /** USDC 1e6 */
  value: bigint;
  price: bigint;
  /** queued exits not yet paid, USDC 1e6 */
  pending: bigint;
}

/** Your vault stake as a position row; null = nothing held or queued. */
export function vaultHolding(position: VaultPosition | undefined, vault: VaultState | undefined): VaultHolding | null {
  if (!position || !vault) return null;
  const pending = position.requests.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.assets, 0n);
  if (position.shares === 0n && pending === 0n) return null;
  return {
    shares: position.shares,
    value: toAssets(position.shares, vault.totalAssets, vault.totalSupply),
    price: sharePrice(vault.totalAssets, vault.totalSupply),
    pending,
  };
}
