import type { FundingPayment } from "@/features/perp/api/types";

export interface HourEarning {
  ts: number;
  /** USDC 6dp, signed: your pro-rata share of funding the vault received that hour */
  earned: bigint;
}

const HOUR = 3600;

// shortcut: pro-rata by current supply, not supply at that hour; fine until supply history is indexed
/** funding only (no price/trade P&L), newest first. */
export function hourlyFunding(payments: FundingPayment[], shares: bigint, supply: bigint): HourEarning[] {
  const byHour = new Map<number, bigint>();
  for (const p of payments) {
    const pay = p.payment ?? p.amount;
    if (p.time === undefined || pay === undefined) continue;
    const h = Math.floor(p.time / 1000 / HOUR) * HOUR;
    byHour.set(h, (byHour.get(h) ?? 0n) - BigInt(pay)); // payment > 0 = paid by vault
  }
  return [...byHour]
    .sort(([a], [b]) => b - a)
    .map(([ts, received]) => ({ ts, earned: supply > 0n ? (received * shares) / supply : 0n }));
}
