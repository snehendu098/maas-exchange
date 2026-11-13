"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/shared/lib/errors";
import { formatUsdcRaw } from "@/shared/lib/units";
import { toast } from "@/shared/ui/toast/toast-store";
import { collateralApi } from "../api/client";
import { perpKeys } from "./query-keys";
import { useTrader } from "./use-user-data";

type Action = "deposit" | "withdraw";
const LABEL: Record<Action, string> = { deposit: "Deposited", withdraw: "Withdrew" };

/** Wallet USDC + deposit/withdraw; refreshes account after. */
export function useCollateral() {
  const address = useTrader();
  const qc = useQueryClient();

  const wallet = useQuery({
    queryKey: perpKeys.wallet(address),
    queryFn: () => (address ? collateralApi.walletBalance(address) : 0n),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ action, amount }: { action: Action; amount: bigint }) => {
      if (!address) throw new Error("Connect a wallet first");
      await collateralApi[action](amount);
    },
    onSuccess: (_, { action, amount }) => {
      toast.success(`${LABEL[action]} ${formatUsdcRaw(amount)} USDC`);
      void qc.invalidateQueries({ queryKey: perpKeys.wallet(address) });
      void qc.invalidateQueries({ queryKey: perpKeys.account(address) });
    },
    onError: (e, { action }) => toast.error(`${action} failed`, errorMessage(e)),
  });

  return {
    walletBalance: wallet.data,
    isPending: mutation.isPending,
    run: mutation.mutateAsync,
  };
}
