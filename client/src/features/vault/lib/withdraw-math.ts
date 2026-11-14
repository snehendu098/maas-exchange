import { mulBpsUp } from "@/shared/lib/units";

export const DEFAULT_WITHDRAW_FEE_BPS = 10;

export interface WithdrawSplit {
  gross: bigint;
  fee: bigint;
  net: bigint;
  /** net paid now from idle */
  instant: bigint;
  /** net claim left for keeper unwind */
  queued: bigint;
  instantFee: bigint;
  queuedFee: bigint;
}

export const withdrawFee = (gross: bigint, feeBps = DEFAULT_WITHDRAW_FEE_BPS) => mulBpsUp(gross, feeBps);

/** idle serves first, rest queued; fee ceil on each part */
export function splitWithdraw(gross: bigint, idle: bigint, feeBps = DEFAULT_WITHDRAW_FEE_BPS): WithdrawSplit {
  const available = idle > 0n ? idle : 0n;
  const instantGross = gross < available ? gross : available;
  const queuedGross = gross - instantGross;
  const instantFee = withdrawFee(instantGross, feeBps);
  const queuedFee = withdrawFee(queuedGross, feeBps);
  const fee = instantFee + queuedFee;
  return {
    gross,
    fee,
    net: gross - fee,
    instant: instantGross - instantFee,
    queued: queuedGross - queuedFee,
    instantFee,
    queuedFee,
  };
}
