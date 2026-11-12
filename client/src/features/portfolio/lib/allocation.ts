export type AllocationKey = "wallet" | "perp" | "vault";

export interface AllocationSlice {
  key: AllocationKey;
  label: string;
  /** USD */
  value: number;
  /** 0..1 of total */
  share: number;
}

const LABELS: Record<AllocationKey, string> = { wallet: "Wallet", perp: "Perp margin", vault: "Vault" };
const ORDER: readonly AllocationKey[] = ["perp", "vault", "wallet"];

/** Where the trader's USDC sits; shares 0 when nothing held. */
export function allocation(parts: Record<AllocationKey, number>): { total: number; slices: AllocationSlice[] } {
  const total = ORDER.reduce((sum, key) => sum + Math.max(0, parts[key]), 0);
  const slices = ORDER.map((key) => {
    const value = Math.max(0, parts[key]);
    return { key, label: LABELS[key], value, share: total > 0 ? value / total : 0 };
  });
  return { total, slices };
}
