"use client";

import { useMemo } from "react";
import { vaultHolding } from "../lib/holding";
import { useVaultPosition, useVaultState } from "./use-vault";

/** Connected wallet's vault stake, null when none. */
export function useVaultHolding() {
  const vault = useVaultState().data;
  const { position } = useVaultPosition();
  return useMemo(() => vaultHolding(position, vault), [position, vault]);
}
