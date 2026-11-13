import { MARKETS, type MarketSymbol } from "./markets";

/** Vault legs, index = exchange market id. */
export const VAULT_MARKETS: readonly MarketSymbol[] = MARKETS.map((m) => m.symbol);
