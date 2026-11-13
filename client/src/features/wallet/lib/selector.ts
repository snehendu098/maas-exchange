import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { CONTRACTS, NETWORK } from "@/shared/config/near";

export interface SelectorBundle {
  selector: WalletSelector;
  modal: WalletSelectorModal;
}

let bundle: Promise<SelectorBundle> | undefined;

/** Lazy browser-only singleton; wallet modules touch window on import. */
export function getSelector(): Promise<SelectorBundle> {
  bundle ??= (async () => {
    const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }] = await Promise.all([
      import("@near-wallet-selector/core"),
      import("@near-wallet-selector/modal-ui"),
      import("@near-wallet-selector/my-near-wallet"),
      import("@near-wallet-selector/meteor-wallet"),
    ]);
    const selector = await setupWalletSelector({ network: NETWORK, modules: [setupMyNearWallet(), setupMeteorWallet()] });
    const modal = setupModal(selector, { contractId: CONTRACTS.exchange || undefined, theme: "dark" });
    return { selector, modal };
  })();
  return bundle;
}
