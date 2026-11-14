import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Signed order, field order = contract borsh layout. */
export interface SignedOrderFields {
  trader: string;
  marketId: number;
  isBuy: boolean;
  /** USDC 1e6 */
  price: bigint;
  /** base 1e8 */
  size: bigint;
  reduceOnly: boolean;
  nonce: bigint;
  /** unix ms */
  expiryMs: bigint;
}

const le = (v: bigint, bytes: number) => {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) out[i] = Number((v >> BigInt(8 * i)) & 0xffn);
  return out;
};

/** borsh(Order): AccountId = u32 len + utf8, u32/u64 LE, U128 = 16 bytes LE, bool = 1 byte. */
export function encodeOrder(o: SignedOrderFields): Uint8Array {
  const trader = new TextEncoder().encode(o.trader);
  const parts = [
    le(BigInt(trader.length), 4), trader,
    le(BigInt(o.marketId), 4),
    Uint8Array.of(o.isBuy ? 1 : 0),
    le(o.price, 16),
    le(o.size, 16),
    Uint8Array.of(o.reduceOnly ? 1 : 0),
    le(o.nonce, 8),
    le(o.expiryMs, 8),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((off, p) => (out.set(p, off), off + p.length), 0);
  return out;
}

export const orderHashBytes = (o: SignedOrderFields) => sha256(encodeOrder(o));

/** Same hex as exchange view order_hash(order). */
export const hashOrder = (o: SignedOrderFields) => bytesToHex(orderHashBytes(o));
