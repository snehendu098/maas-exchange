import { describe, expect, test } from "bun:test";
import type { VaultPosition, VaultState } from "../api/types";
import { sharePrice, toAssets, toShares, toSharesUp } from "./share-math";
import { previewDeposit, previewWithdraw } from "./vault-preview";
import { splitWithdraw, withdrawFee } from "./withdraw-math";

const usdc = (n: number) => BigInt(Math.round(n * 1e6));

describe("withdraw fee", () => {
  test("0.1% default, ceil", () => {
    expect(withdrawFee(usdc(1000))).toBe(usdc(1));
    expect(withdrawFee(1n)).toBe(1n);
    expect(withdrawFee(0n)).toBe(0n);
  });
  test("configurable bps", () => {
    expect(withdrawFee(usdc(1000), 25)).toBe(usdc(2.5));
  });
});

describe("instant vs queued split", () => {
  test("fits idle -> all instant", () => {
    const s = splitWithdraw(usdc(1000), usdc(5000));
    expect(s).toMatchObject({ instant: usdc(999), queued: 0n, fee: usdc(1), net: usdc(999) });
  });
  test("over idle -> rest queued, fee on both", () => {
    const s = splitWithdraw(usdc(8000), usdc(5000));
    expect(s.instant).toBe(usdc(4995));
    expect(s.queued).toBe(usdc(2997));
    expect(s.instantFee).toBe(usdc(5));
    expect(s.queuedFee).toBe(usdc(3));
    expect(s.instant + s.queued + s.fee).toBe(s.gross);
  });
  test("no idle -> all queued", () => {
    const s = splitWithdraw(usdc(100), 0n);
    expect(s.instant).toBe(0n);
    expect(s.queued).toBe(usdc(99.9));
  });
  test("negative idle treated as zero", () => {
    expect(splitWithdraw(usdc(100), -5n).instant).toBe(0n);
  });
});

// shares 6dp: 1 USDC = 1 share at price 1
const sh = (n: number) => usdc(n);

describe("share math", () => {
  test("empty vault mints 1:1", () => {
    expect(toShares(usdc(10), 0n, 0n)).toBe(sh(10));
    expect(toAssets(sh(10), 0n, 0n)).toBe(usdc(10));
    expect(sharePrice(0n, 0n)).toBe(1_000_000n);
  });
  test("price above 1 mints fewer shares, floor", () => {
    expect(sharePrice(usdc(1050), sh(1000))).toBe(1_050_000n);
    expect(toShares(usdc(105), usdc(1050), sh(1000))).toBe(sh(100));
    expect(toShares(1n, usdc(1050), sh(1000))).toBe(0n);
  });
  test("toSharesUp ceils, round trip never under-pays", () => {
    const [a, s] = [usdc(1050), sh(1000)];
    expect(toSharesUp(1n, a, s)).toBe(1n);
    const shares = toSharesUp(usdc(33.333333), a, s);
    expect(toAssets(shares, a, s)).toBeGreaterThanOrEqual(usdc(33.333333));
  });
});

const config = { withdrawFeeBps: 10, idleBufferBps: 200, shortLeverage: 2, cooldownSec: 3600 };
const vault: VaultState = {
  totalAssets: usdc(100_000),
  totalSupply: sh(80_000),
  idle: usdc(2_000),
  config,
  legs: [],
};
const position: VaultPosition = { walletUsdc: usdc(500), shares: sh(4_000), requests: [] };

describe("previews", () => {
  test("deposit shares + errors", () => {
    expect(previewDeposit(usdc(125), vault, position)).toEqual({ shares: sh(100), error: null });
    expect(previewDeposit(usdc(600), vault, position).error).toBe("Insufficient USDC");
    expect(previewDeposit(null, vault).error).toBe("Invalid amount");
    expect(previewDeposit(0n, vault).error).toBe("Enter an amount");
    expect(previewDeposit(usdc(1)).error).toBe("Loading vault…");
  });
  test("withdraw instant", () => {
    const p = previewWithdraw(usdc(1000), false, vault, position);
    expect(p.error).toBeNull();
    expect(p.shares).toBe(sh(800));
    expect(p.split?.instant).toBe(usdc(999));
    expect(p.split?.queued).toBe(0n);
  });
  test("withdraw max over idle -> queued", () => {
    const p = previewWithdraw(null, true, vault, position);
    expect(p.shares).toBe(position.shares);
    expect(p.split?.gross).toBe(usdc(5_000));
    expect(p.split?.instant).toBe(usdc(1_998));
    expect(p.split?.queued).toBe(usdc(2_997));
  });
  test("withdraw more than held", () => {
    expect(previewWithdraw(usdc(6_000), false, vault, position).error).toBe("Insufficient shares");
  });
});
