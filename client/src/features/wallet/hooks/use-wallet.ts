"use client";

import { useState, useSyncExternalStore } from "react";
import { errorMessage } from "@/shared/lib/errors";
import { toast } from "@/shared/ui/toast/toast-store";
import { getSelector } from "../lib/selector";
import { walletStore } from "../lib/wallet-store";

/** NEAR account state + connect/disconnect with error toasts. */
export function useWallet() {
  const { accountId, walletId, ready } = useSyncExternalStore(walletStore.subscribe, walletStore.get, walletStore.getServer);
  const [isConnecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    try {
      (await getSelector()).modal.show();
    } catch (e) {
      toast.error("Connect failed", errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await (await (await getSelector()).selector.wallet()).signOut();
    } catch (e) {
      toast.error("Disconnect failed", errorMessage(e));
    }
  };

  return { accountId, walletId, ready, isConnected: Boolean(accountId), isConnecting, connect, disconnect };
}
