export const vaultKeys = {
  state: ["vault", "state"] as const,
  position: (owner?: string) => ["vault", "position", owner ?? "none"] as const,
  funding: ["vault", "funding"] as const,
  lastFunding: ["vault", "perp", "last-funding"] as const,
  vaultFunding: ["vault", "perp", "vault-funding"] as const,
};
