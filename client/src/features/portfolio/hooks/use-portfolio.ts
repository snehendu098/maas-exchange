"use client";

import { useMemo } from "react";
import { usdcToNumber } from "@/shared/lib/units";
import { useCollateral } from "@/features/perp/hooks/use-collateral";
import { useMarketStats } from "@/features/perp/hooks/use-market-data";
import { useFills, useFunding, usePerpAccount, usePositions, useTrader } from "@/features/perp/hooks/use-user-data";
import { useVaultPosition, useVaultState } from "@/features/vault/hooks/use-vault";
import { toAssets } from "@/features/vault/lib/share-math";
import { allocation } from "../lib/allocation";
import { marginHealth } from "../lib/margin-health";
import { pnlEvents, returnBands, summarizeOutcomes, tradeOutcomes } from "../lib/pnl-history";
import { computePortfolioStats, withdrawable } from "../lib/portfolio-stats";

/** Everything the portfolio renders, USD numbers; null fields = no wallet. */
export function usePortfolio() {
  const trader = useTrader();
  const account = usePerpAccount(trader).data;
  const positions = usePositions(trader).data;
  const fills = useFills(trader).data;
  const funding = useFunding(trader).data;
  const { walletBalance } = useCollateral();
  const { byId } = useMarketStats();
  const vault = useVaultState().data;
  const { position } = useVaultPosition();

  return useMemo(() => {
    const list = fills ?? [];
    const paid = funding ?? [];
    const s = computePortfolioStats(account, positions ?? [], list, paid, byId);
    const outcomes = tradeOutcomes(list);
    const vaultRaw = vault && position ? toAssets(position.shares, vault.totalAssets, vault.totalSupply) : 0n;
    const usd = usdcToNumber;
    const equity = usd(s.equity);
    const initial = account ? usd(account.initialMargin) : 0;
    const maintenance = account ? usd(account.maintenanceMargin) : 0;

    return {
      trader,
      connected: Boolean(trader),
      /** dated pnl deltas for the chart */
      events: pnlEvents(list, paid),
      unrealizedRaw: s.unrealized,
      openPositions: positions?.length ?? 0,
      equity,
      free: usd(withdrawable(account)),
      withdrawableRaw: withdrawable(account),
      initial,
      maintenance,
      realized: usd(s.realized),
      unrealized: usd(s.unrealized),
      fees: usd(s.fees),
      funding: usd(s.funding),
      net: usd(s.net),
      volume: usd(s.volume),
      trades: s.trades,
      closed: outcomes.length,
      record: summarizeOutcomes(outcomes),
      bands: returnBands(outcomes),
      health: marginHealth(equity, initial, maintenance),
      allocation: allocation({
        wallet: walletBalance === undefined ? 0 : usd(walletBalance),
        perp: account ? usd(account.collateral) : 0,
        vault: usd(vaultRaw),
      }),
    };
  }, [trader, account, positions, fills, funding, byId, walletBalance, vault, position]);
}

export type Portfolio = ReturnType<typeof usePortfolio>;
