"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { useDismiss } from "@/shared/hooks/use-dismiss";
import { cn } from "@/shared/lib/cn";
import { truncateAddress } from "@/shared/lib/format";
import { AddressAvatar } from "@/shared/ui/address-avatar";
import { Button } from "@/shared/ui/button";
import { useWallet } from "../hooks/use-wallet";

const MENU_ITEM =
  "flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-fg-secondary transition-colors hover:bg-surface-raised hover:text-fg";

const PILL =
  "focus-ring inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border border-border bg-surface-raised pr-3 pl-2 text-sm font-medium text-fg transition-colors hover:bg-surface-strong";

export function ConnectButton({ className }: { className?: string }) {
  const wallet = useWallet();
  const menu = useDisclosure();
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, menu.close, menu.isOpen);

  return (
    <div ref={rootRef} className={cn("relative flex", className)}>
      {wallet.accountId ? (
        <button type="button" onClick={menu.toggle} aria-expanded={menu.isOpen} aria-haspopup="menu" className={PILL}>
          <AddressAvatar address={wallet.accountId} className="size-6 rounded-md" />
          <span className="font-mono">{truncateAddress(wallet.accountId, 10, 6)}</span>
          <ChevronDown className={cn("size-4 text-fg-muted transition-transform", menu.isOpen && "rotate-180")} strokeWidth={1.75} />
        </button>
      ) : (
        <Button variant="primary" onClick={() => void wallet.connect()} disabled={wallet.isConnecting} className="gap-2 rounded-full px-5">
          <Wallet className="size-4" strokeWidth={1.6} />
          {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
        </Button>
      )}

      <AnimatePresence>
        {menu.isOpen && wallet.accountId && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[calc(100%+8px)] right-0 z-50 w-64 origin-top-right rounded-2xl border border-border bg-surface/90 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <p className="label-mono truncate px-3 pt-1.5 pb-2 text-fg-muted">{wallet.accountId}</p>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                void wallet.disconnect();
                menu.close();
              }}
            >
              <LogOut className="size-4" strokeWidth={1.6} />
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
