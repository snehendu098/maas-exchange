import { describe, expect, test } from "bun:test";
import type { VaultPosition, VaultState, WithdrawRequest } from "../api/types";
import { vaultHolding } from "./holding";
import { toAssets } from "./share-math";

const VAULT = { totalAssets: 2_000_000_000n, totalSupply: 1_000n * 10n ** 6n } as VaultState;
const req = (assets: bigint, status: WithdrawRequest["status"]): WithdrawRequest => ({ id: 1n, shares: 1n, assets, fee: 0n, status });
const pos = (shares: bigint, requests: WithdrawRequest[] = []): VaultPosition => ({ walletUsdc: 0n, shares, requests });

describe("vaultHolding", () => {
  test("null without data or stake", () => {
    expect(vaultHolding(undefined, VAULT)).toBeNull();
    expect(vaultHolding(pos(0n), VAULT)).toBeNull();
    expect(vaultHolding(pos(0n, [req(5n, "FULFILLED")]), VAULT)).toBeNull();
  });
  test("value from shares, pending only counts queued exits", () => {
    const shares = 10n * 10n ** 6n;
    const h = vaultHolding(pos(shares, [req(7n, "PENDING"), req(9n, "FULFILLED")]), VAULT);
    expect(h?.value).toBe(toAssets(shares, VAULT.totalAssets, VAULT.totalSupply));
    expect(h?.pending).toBe(7n);
  });
  test("queued exit alone still shows", () => {
    expect(vaultHolding(pos(0n, [req(3n, "PENDING")]), VAULT)?.pending).toBe(3n);
  });
});
