import type { MarketSymbol } from "@/shared/config/markets";

// usdc 1e6, shares 1e6, size base 1e8, funding rate 1e18 = 100%, ts unix seconds

export type VaultMode = "HEDGED" | "FLAT";

export interface VaultConfig {
  withdrawFeeBps: number;
  idleBufferBps: number;
  /** spot:margin split, spot = L/(L+1) of allocation */
  shortLeverage: number;
  cooldownSec: number;
}

export interface VaultLeg {
  market: MarketSymbol;
  mode: VaultMode;
  weightBps: number;
  spotSize: bigint;
  /** short magnitude */
  shortSize: bigint;
  spotValue: bigint;
}

export interface VaultState {
  /** NAV: idle + spot + perp equity */
  totalAssets: bigint;
  totalSupply: bigint;
  idle: bigint;
  config: VaultConfig;
  legs: VaultLeg[];
}

export type WithdrawStatus = "PENDING" | "FULFILLED";

export interface WithdrawRequest {
  id: bigint;
  shares: bigint;
  /** net claim after fee */
  assets: bigint;
  fee: bigint;
  status: WithdrawStatus;
}

export interface VaultPosition {
  walletUsdc: bigint;
  shares: bigint;
  requests: WithdrawRequest[];
}

/** request_redeem return: {id, assets} */
export interface RedeemResult {
  /** queued request id; null when fully paid now */
  requestId: bigint | null;
  /** assets paid out now */
  instant: bigint;
}

/** Chain port: vault contract + USDC. */
export interface VaultApi {
  getVault(): Promise<VaultState>;
  getPosition(owner: string): Promise<VaultPosition>;
  deposit(owner: string, assets: bigint): Promise<void>;
  /** request_redeem: instant part paid from idle, rest queued */
  redeem(shares: bigint): Promise<RedeemResult | undefined>;
  cancelRequest(id: bigint): Promise<void>;
}

/** hourly funding print for one market */
export interface FundingRecord {
  key: string;
  market: MarketSymbol;
  /** unix s */
  ts: number;
  rate: bigint;
}

/** Funding history port (gateway). */
export interface VaultHistory {
  getFunding(sinceTs: number): Promise<FundingRecord[]>;
}
