import { getSelector } from "./selector";

export interface WalletSnapshot {
  accountId?: string;
  walletId?: string;
  ready: boolean;
}

const SERVER: WalletSnapshot = { ready: false };
let state: WalletSnapshot = SERVER;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void getSelector().then(({ selector }) => {
    selector.store.observable.subscribe((s) => {
      const active = s.accounts.find((a) => a.active) ?? s.accounts[0];
      state = { accountId: active?.accountId, walletId: s.selectedWalletId ?? undefined, ready: true };
      listeners.forEach((l) => l());
    });
  });
}

/** useSyncExternalStore adapter over the selector store. */
export const walletStore = {
  subscribe(listener: () => void) {
    start();
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: () => state,
  getServer: () => SERVER,
};
