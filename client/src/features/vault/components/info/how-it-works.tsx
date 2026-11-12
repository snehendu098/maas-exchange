"use client";

import { ArrowDownUp, Clock, Scale, ShieldCheck, Wallet } from "lucide-react";
import { HowItWorks, type HowStep } from "@/shared/ui/how-it-works";
import type { VaultConfig } from "../../api/types";
import { useVaultState } from "../../hooks/use-vault";
import { formatBpsPercent } from "../../lib/vault-format";
import { VaultFlow } from "./vault-flow";

function steps(cfg: VaultConfig | undefined): HowStep[] {
  const fee = cfg ? formatBpsPercent(cfg.withdrawFeeBps) : "0.10%";
  const buffer = cfg ? formatBpsPercent(cfg.idleBufferBps) : "2.00%";
  return [
    { icon: Wallet, title: "Deposit USDC", desc: "Mint shares at the current share price. No deposit fee." },
    { icon: Scale, title: "Delta-neutral legs", desc: "Each market pairs a spot long with an equal perp short, so price moves net to zero." },
    { icon: ArrowDownUp, title: "Earns funding", desc: "Positive funding pays shorts; that's the yield. Market weights come from vault config, and vault legs pay no trading fees." },
    { icon: ShieldCheck, title: "FLAT when negative", desc: "When funding turns negative the keeper unwinds the leg to USDC. It re-hedges once funding is positive again." },
    { icon: Clock, title: "Withdraw", desc: `Paid instantly from the ${buffer} idle buffer; the rest settles once the keeper unwinds legs pro-rata. ${fee} exit fee.` },
  ];
}

/** Vault explainer; fee / buffer read from live config. */
export function VaultHowItWorks() {
  const items = steps(useVaultState().data?.config);
  return <HowItWorks title="How the vault works" steps={items} diagram={<VaultFlow />} />;
}
