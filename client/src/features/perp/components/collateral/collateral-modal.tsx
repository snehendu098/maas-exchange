"use client";

import { Modal } from "@/shared/ui/modal";
import { CollateralForm, type CollateralMode } from "./collateral-form";

export type { CollateralMode };

interface CollateralModalProps {
  open: boolean;
  initialMode: CollateralMode;
  /** withdrawable, USDC 1e6 */
  withdrawable: bigint;
  onClose: () => void;
}

export function CollateralModal({ open, initialMode, withdrawable, onClose }: CollateralModalProps) {
  return (
    <Modal open={open} title="Manage USDC collateral" onClose={onClose}>
      <CollateralForm key={initialMode} initialMode={initialMode} withdrawable={withdrawable} onDone={onClose} />
    </Modal>
  );
}
