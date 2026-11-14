import deployment from "./markets.json";

export type MarketSymbol = "BTC" | "ETH" | "NEAR";

export interface MarketConfig {
  id: number;
  symbol: MarketSymbol;
  name: string;
  quote: "USDC";
  color: string;
  glyph: string;
  /** price units, USDC 1e6 */
  tickSize: bigint;
  /** size units, base 1e8 */
  lotSize: bigint;
  imrBps: number;
  mmrBps: number;
  maxLeverage: number;
  makerFeeBps: number;
  takerFeeBps: number;
  /** static fallback price + deploy script default */
  refPrice: number;
  /** pyth price feed id (0x hex) */
  feedId: string;
}

interface DeployedMarket {
  id: number;
  symbol: string;
  feedId: string;
  tick: number | string;
  lot: number | string;
  imrBps: number | string;
  mmrBps: number | string;
}

const DISPLAY: Record<MarketSymbol, Pick<MarketConfig, "name" | "color" | "glyph" | "refPrice">> = {
  BTC: { name: "Bitcoin", color: "#f7931a", glyph: "₿", refPrice: 100_000 },
  ETH: { name: "Ethereum", color: "#627eea", glyph: "Ξ", refPrice: 3_500 },
  NEAR: { name: "NEAR", color: "#00ec97", glyph: "N", refPrice: 3 },
};

// default exchange fees
const MAKER_FEE_BPS = 2;
const TAKER_FEE_BPS = 5;

function isSymbol(s: string): s is MarketSymbol {
  return s in DISPLAY;
}

function toConfig(m: DeployedMarket): MarketConfig {
  if (!isSymbol(m.symbol)) throw new Error(`unknown market ${m.symbol}`);
  const imrBps = Number(m.imrBps);
  return {
    id: Number(m.id),
    symbol: m.symbol,
    quote: "USDC",
    tickSize: BigInt(m.tick),
    lotSize: BigInt(m.lot),
    imrBps,
    mmrBps: Number(m.mmrBps),
    maxLeverage: Math.floor(10_000 / imrBps),
    makerFeeBps: MAKER_FEE_BPS,
    takerFeeBps: TAKER_FEE_BPS,
    feedId: m.feedId,
    ...DISPLAY[m.symbol],
  };
}

export const MARKETS: readonly MarketConfig[] = (deployment.markets as DeployedMarket[])
  .map(toConfig)
  .sort((a, b) => a.id - b.id);

export const DEFAULT_MARKET: MarketSymbol = "BTC";

const BY_SYMBOL = new Map(MARKETS.map((m) => [m.symbol.toLowerCase(), m]));
const BY_ID = new Map(MARKETS.map((m) => [m.id, m]));

export function getMarket(symbol: string): MarketConfig | undefined {
  return BY_SYMBOL.get(symbol.toLowerCase());
}

export function getMarketById(id: number): MarketConfig | undefined {
  return BY_ID.get(id);
}

export function getMarketByIdOrThrow(id: number): MarketConfig {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`unknown market id ${id}`);
  return m;
}
