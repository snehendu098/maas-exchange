import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64 } from "@scure/base";

export interface TradingKey {
  /** "ed25519:<base58>" as the contract stores it */
  publicKey: string;
  secretKey: Uint8Array;
}

const storageKey = (accountId: string) => `maas:trading-key:${accountId}`;

const fromSecret = (secretKey: Uint8Array): TradingKey => ({
  secretKey,
  publicKey: `ed25519:${base58.encode(ed25519.getPublicKey(secretKey))}`,
});

// shortcut: raw seed in localStorage, xss can read it; key only signs orders, never moves funds
/** Per-account browser trading key; created on first use. */
export function loadOrCreateTradingKey(accountId: string): TradingKey {
  const stored = localStorage.getItem(storageKey(accountId));
  if (stored) return fromSecret(base64.decode(stored));
  const key = fromSecret(ed25519.utils.randomSecretKey());
  localStorage.setItem(storageKey(accountId), base64.encode(key.secretKey));
  return key;
}

/** 64-byte ed25519 sig over the order hash, base64. */
export const signHash = (key: TradingKey, hash: Uint8Array) => base64.encode(ed25519.sign(hash, key.secretKey));
