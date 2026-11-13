import { notional } from "@/shared/lib/units";

const BPS = 10_000;

/** entryNotional / |size|, USDC 1e6 per base. */
export function entryPrice(size: bigint, entryNotional: bigint): bigint {
  if (size === 0n) return 0n;
  const abs = size < 0n ? -size : size;
  return (entryNotional * 10n ** 8n) / abs;
}

/** Matches PerpMath.upnl. */
export function unrealizedPnl(size: bigint, entryNotional: bigint, mark: bigint): bigint {
  const p = notional(size, mark) - entryNotional;
  return size < 0n ? -p : p;
}

export interface LiqInput {
  size: bigint;
  entryNotional: bigint;
  mmrBps: number;
  /** collateral + other positions uPnL - other MM, USDC 1e6 */
  marginBuffer: bigint;
}

/** Single-position cross-margin estimate; null when no liq price. */
export function liquidationPrice({ size, entryNotional, mmrBps, marginBuffer }: LiqInput): number | null {
  if (size === 0n) return null;
  const s = Math.abs(Number(size)) / 1e8;
  const e = Number(entryNotional) / 1e6;
  const c = Number(marginBuffer) / 1e6;
  const mmr = mmrBps / BPS;
  // long: c + s*m - e = s*m*mmr ; short: c + e - s*m = s*m*mmr
  const m = size > 0n ? (e - c) / (s * (1 - mmr)) : (c + e) / (s * (1 + mmr));
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** Margin for a given leverage, USDC 1e6. */
export function marginForLeverage(notionalValue: bigint, leverage: number): bigint {
  if (leverage <= 0) return notionalValue;
  return (notionalValue * 100n) / BigInt(Math.round(leverage * 100));
}

/** Return on margin in percent. */
export function roePercent(pnl: bigint, size: bigint, entryNotional: bigint, imrBps: number): number {
  const margin = (Number(entryNotional) * imrBps) / BPS;
  return margin > 0 && size !== 0n ? (Number(pnl) / margin) * 100 : 0;
}

export function isReduce(posSize: bigint, isBuy: boolean, size: bigint) {
  const abs = posSize < 0n ? -posSize : posSize;
  return posSize !== 0n && posSize > 0n !== isBuy && size <= abs;
}

/** Port of PerpExchange._applyFill (close basis rounds against trader). */
export function applyFill(p: { size: bigint; entryNotional: bigint }, isBuy: boolean, size: bigint, price: bigint) {
  const old = p.size;
  const oldAbs = old < 0n ? -old : old;
  const q = notional(size, price);
  let pnl = 0n;
  if (old === 0n || old > 0n === isBuy) {
    p.entryNotional += q;
  } else {
    const closed = size < oldAbs ? size : oldAbs;
    const qClose = closed === size ? q : notional(closed, price);
    const num = p.entryNotional * closed;
    const basis = old > 0n ? (num + oldAbs - 1n) / oldAbs : num / oldAbs;
    pnl = old > 0n ? qClose - basis : basis - qClose;
    p.entryNotional = p.entryNotional - basis + (q - qClose);
  }
  p.size = isBuy ? old + size : old - size;
  return pnl;
}
