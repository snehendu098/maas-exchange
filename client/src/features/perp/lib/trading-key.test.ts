import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64 } from "@scure/base";
import { loadOrCreateTradingKey, signHash } from "./trading-key";

const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
} as Storage;

describe("trading key", () => {
  test("persists per account and signs verifiably", () => {
    const k = loadOrCreateTradingKey("bob.near");
    expect(loadOrCreateTradingKey("bob.near").publicKey).toBe(k.publicKey);
    expect(loadOrCreateTradingKey("alice.near").publicKey).not.toBe(k.publicKey);
    const hash = new Uint8Array(32).fill(7);
    const sig = base64.decode(signHash(k, hash));
    expect(sig.length).toBe(64);
    expect(ed25519.verify(sig, hash, base58.decode(k.publicKey.slice("ed25519:".length)))).toBe(true);
  });
});
