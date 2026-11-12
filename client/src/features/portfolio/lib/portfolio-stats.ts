import { notional } from "@/shared/lib/units";
import type { Account, FundingPayment, MarketStats, Position, UserFill } from "@/features/perp/api/types";
import { unrealizedPnl } from "@/features/perp/lib/position-math";
import { fundingPaid } from "./pnl-history";

export interface PortfolioStats {
  equity: bigint;
  realized: bigint;
  unrealized: bigint;
  fees: bigint;
  /** net funding paid; < 0 = received */
  funding: bigint;
  /** realized + unrealized - fees - funding */
  net: bigint;
  volume: bigint;
  trades: number;
}

/** Aggregates from account, positions, fills, funding; all USDC 1e6. */
export function computePortfolioStats(
  account: Account | undefined,
  positions: Position[],
  fills: UserFill[],
  funding: FundingPayment[],
  stats: Map<number, MarketStats>,
): PortfolioStats {
  // contract equity = collateral + uPnL - pending funding; fall back to mark math before account loads
  const unrealized = account
    ? BigInt(account.equity) - BigInt(account.collateral)
    : positions.reduce((sum, p) => {
        const s = stats.get(p.market);
        return s ? sum + unrealizedPnl(BigInt(p.size), BigInt(p.entryNotional), BigInt(s.markPrice)) : sum;
      }, 0n);
  const realized = fills.reduce((s, f) => s + BigInt(f.realizedPnl), 0n);
  const fees = fills.reduce((s, f) => s + BigInt(f.fee), 0n);
  const paid = funding.reduce((s, p) => s + fundingPaid(p), 0n);
  return {
    equity: account ? BigInt(account.equity) : 0n,
    realized,
    unrealized,
    fees,
    funding: paid,
    net: realized + unrealized - fees - paid,
    volume: fills.reduce((s, f) => s + notional(f.size, f.price), 0n),
    trades: fills.length,
  };
}

/** min(collateral, equity - initial margin), USDC 1e6. Order form's rule. */
export function withdrawable(account: Account | undefined): bigint {
  if (!account) return 0n;
  const equity = BigInt(account.equity);
  const im = BigInt(account.initialMargin);
  const free = equity > im ? equity - im : 0n;
  const collateral = BigInt(account.collateral);
  return collateral < free ? collateral : free;
}
