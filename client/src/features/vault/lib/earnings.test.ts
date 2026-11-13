import { expect, test } from "bun:test";
import { hourlyFunding } from "./earnings";

const SH = 10n ** 6n; // 1 share
const pay = (sec: number, usdc6: number) => ({ market: 0, payment: String(usdc6), time: sec * 1000 });

test("funding only, pro-rata by supply, newest first", () => {
  const payments = [pay(3601, -1_000_000), pay(3603, 400_000), pay(7202, -2_000_000)];
  expect(hourlyFunding(payments, 100n * SH, 1000n * SH)).toEqual([
    { ts: 7200, earned: 200_000n }, // 2 USDC * 100/1000
    { ts: 3600, earned: 60_000n }, // (1 - 0.4) USDC * 100/1000
  ]);
  expect(hourlyFunding(payments, 1n, 0n).every((h) => h.earned === 0n)).toBe(true);
});
