"use client";

import { useQuery } from "@tanstack/react-query";
import { perpApi } from "@/features/perp/api/client";
import type { MarketSymbol } from "@/shared/config/markets";
import { CONTRACTS } from "@/shared/config/near";
import { VAULT_MARKETS } from "@/shared/config/vault";
import { summarizeFunding } from "../lib/funding";
import { vaultKeys } from "./query-keys";
import { useVaultHistoryReader } from "./use-vault-api";

const POLL_MS = 60_000;
const WINDOW_SEC = 7 * 86_400;

const since = () => Math.floor(Date.now() / 1000) - WINDOW_SEC;

export function useFundingHistory() {
  const reader = useVaultHistoryReader();
  const query = useQuery({ queryKey: vaultKeys.funding, queryFn: () => reader.getFunding(since()), refetchInterval: POLL_MS });
  return { ...query, summary: query.data ? summarizeFunding(query.data) : undefined };
}

/** last settled 1h funding print per vault market, straight from the perp gateway */
export function useLastFundingRates() {
  return useQuery({
    queryKey: vaultKeys.lastFunding,
    queryFn: async () => {
      const out: Partial<Record<MarketSymbol, bigint>> = {};
      await Promise.all(
        VAULT_MARKETS.map(async (sym, id) => {
          const last = (await perpApi.getFundingRates(id)).reduce<{ time: number; rate: string } | undefined>(
            (a, p) => (!a || p.time > a.time ? p : a),
            undefined,
          );
          if (last) out[sym] = BigInt(last.rate);
        }),
      );
      return out;
    },
    refetchInterval: POLL_MS,
  });
}

/** vault's own funding payments (perp gateway), newest first, max 100 rows */
export function useVaultFunding() {
  return useQuery({
    queryKey: vaultKeys.vaultFunding,
    queryFn: () => perpApi.getFunding(CONTRACTS.vault),
    refetchInterval: POLL_MS,
  });
}
