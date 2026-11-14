"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/features/wallet/hooks/use-wallet";
import { errorMessage } from "@/shared/lib/errors";
import { toast } from "@/shared/ui/toast/toast-store";
import { vaultKeys } from "./query-keys";
import { useVaultApi } from "./use-vault-api";

const POLL_MS = 5_000;

/** NAV, supply, idle, legs, config. */
export function useVaultState() {
  const api = useVaultApi();
  return useQuery({ queryKey: vaultKeys.state, queryFn: () => api.getVault(), refetchInterval: POLL_MS });
}

/** Wallet USDC, free shares, withdraw requests + cancel. */
export function useVaultPosition() {
  const api = useVaultApi();
  const qc = useQueryClient();
  const address = useWallet().accountId;

  const query = useQuery({
    queryKey: vaultKeys.position(address),
    queryFn: () => api.getPosition(address!),
    enabled: Boolean(address),
    refetchInterval: POLL_MS,
  });

  const cancel = useMutation({
    mutationFn: (id: bigint) => api.cancelRequest(id),
    onSuccess: () => toast.info("Withdraw request cancelled"),
    onError: (e) => toast.error("Cancel failed", errorMessage(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: vaultKeys.position(address) }),
  });

  return { address, position: query.data, cancelRequest: (id: bigint) => cancel.mutate(id), cancelPending: cancel.isPending };
}
