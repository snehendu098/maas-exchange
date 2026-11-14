import { perpApi } from "@/features/perp/api/client";
import { VAULT_MARKETS } from "@/shared/config/vault";
import type { FundingRecord, VaultHistory } from "./types";

/** Hourly funding prints per vault market from the gateway. */
export function createGatewayHistory(): VaultHistory {
  return {
    getFunding: async (sinceTs) => {
      const perMarket = await Promise.all(
        VAULT_MARKETS.map(async (market, id) =>
          (await perpApi.getFundingRates(id))
            .filter((p) => p.time >= sinceTs)
            .map((p): FundingRecord => ({ key: `${id}-${p.time}`, market, ts: p.time, rate: BigInt(p.rate) })),
        ),
      );
      return perMarket.flat();
    },
  };
}
