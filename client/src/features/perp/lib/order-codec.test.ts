import { describe, expect, test } from "bun:test";
import { encodeOrder, hashOrder, type SignedOrderFields } from "./order-codec";

const ORDER: SignedOrderFields = {
  trader: "bob.near",
  marketId: 1,
  isBuy: true,
  price: 258n,
  size: 1n,
  reduceOnly: false,
  nonce: 2n,
  expiryMs: 3n,
};

describe("order codec", () => {
  test("borsh layout", () => {
    const b = encodeOrder(ORDER);
    expect(b.length).toBe(4 + 8 + 4 + 1 + 16 + 16 + 1 + 8 + 8);
    expect([...b.slice(0, 4)]).toEqual([8, 0, 0, 0]);
    expect(new TextDecoder().decode(b.slice(4, 12))).toBe("bob.near");
    expect([...b.slice(12, 17)]).toEqual([1, 0, 0, 0, 1]);
    expect([...b.slice(17, 19)]).toEqual([2, 1]); // 258 LE
    expect(b[49]).toBe(0);
    expect(b[50]).toBe(2);
    expect(b[58]).toBe(3);
  });
  test("hash is 32-byte hex, field sensitive", () => {
    expect(hashOrder(ORDER)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOrder({ ...ORDER, nonce: 3n })).not.toBe(hashOrder(ORDER));
  });
});
