"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sendCalls } from "@/features/wallet/lib/transact";
import { CONTRACTS } from "@/shared/config/near";
import { view } from "@/shared/lib/near-rpc";
import { loadOrCreateTradingKey, type TradingKey } from "../lib/trading-key";
import { perpKeys } from "./query-keys";

/** Browser trading key; registers it on the exchange once (add_trading_key). */
export function useTradingKey(accountId?: string) {
  const qc = useQueryClient();
  const registered = useQuery({
    queryKey: perpKeys.tradingKey(accountId),
    enabled: Boolean(accountId),
    staleTime: Infinity,
    queryFn: async () => {
      const key = loadOrCreateTradingKey(accountId!);
      const keys = await view<string[]>(CONTRACTS.exchange, "trading_keys", { account_id: accountId });
      return keys.includes(key.publicKey);
    },
  });

  /** Key ready to sign; sends add_trading_key first when not on chain yet. */
  const ensure = async (): Promise<TradingKey> => {
    if (!accountId) throw new Error("Connect a wallet first");
    const key = loadOrCreateTradingKey(accountId);
    if (registered.data) return key;
    await sendCalls([{ receiverId: CONTRACTS.exchange, method: "add_trading_key", args: { public_key: key.publicKey } }]);
    qc.setQueryData(perpKeys.tradingKey(accountId), true);
    return key;
  };

  return { registered: registered.data, ensure };
}
