export type HealthLevel = "idle" | "safe" | "watch" | "risk";

export interface MarginHealth {
  /** maint. margin over equity, 0..1+; liquidation at 1 */
  ratio: number;
  /** initial margin over equity, 0..1+ */
  usage: number;
  level: HealthLevel;
}

const WATCH = 0.5;
const RISK = 0.8;

/** Liquidation distance from equity and margin, all USD. */
export function marginHealth(equity: number, initial: number, maintenance: number): MarginHealth {
  if (maintenance <= 0) return { ratio: 0, usage: 0, level: "idle" };
  if (equity <= 0) return { ratio: 1, usage: 1, level: "risk" };
  const ratio = maintenance / equity;
  const level = ratio >= RISK ? "risk" : ratio >= WATCH ? "watch" : "safe";
  return { ratio, usage: initial / equity, level };
}
