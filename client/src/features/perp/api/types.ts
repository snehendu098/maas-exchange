
// wire shapes, modeled on proto/perp/v1. amounts = base-10 strings
// price USDC 1e6, size base 1e8, usdc 1e6, funding rate 1e18 = 100%
export type Dec = string;

export type Side = "SIDE_BUY" | "SIDE_SELL";
export type OrderType = "ORDER_TYPE_LIMIT" | "ORDER_TYPE_MARKET";
export type TimeInForce = "TIME_IN_FORCE_GTC" | "TIME_IN_FORCE_IOC" | "TIME_IN_FORCE_POST_ONLY";

export type OrderState =
  | "ORDER_STATE_ACCEPTED"
  | "ORDER_STATE_REJECTED"
  | "ORDER_STATE_RESTING"
  | "ORDER_STATE_PARTIALLY_FILLED"
  | "ORDER_STATE_FILLED"
  | "ORDER_STATE_CANCELLED"
  | "ORDER_STATE_CANCEL_REJECTED";

export type Reason =
  | "REASON_UNSPECIFIED"
  | "REASON_UNKNOWN_MARKET"
  | "REASON_WRONG_MARKET"
  | "REASON_ZERO_SIZE"
  | "REASON_INVALID_LOT"
  | "REASON_INVALID_TICK"
  | "REASON_MISSING_PRICE"
  | "REASON_INVALID_TIF"
  | "REASON_DUPLICATE_ORDER_ID"
  | "REASON_POST_ONLY_WOULD_CROSS"
  | "REASON_REDUCE_ONLY_WOULD_INCREASE"
  | "REASON_INSUFFICIENT_MARGIN"
  | "REASON_MISSING_MARK"
  | "REASON_USER"
  | "REASON_UNFILLED"
  | "REASON_SELF_TRADE"
  | "REASON_REDUCE_ONLY"
  | "REASON_UNKNOWN_ORDER"
  | "REASON_NOT_OWNER";

export interface Market {
  id: number;
  symbol: string;
  tickSize: Dec;
  lotSize: Dec;
  imrBps: number;
  mmrBps: number;
  makerFeeBps: number;
  takerFeeBps: number;
}

/** one settled hourly funding print (GET /funding/{market}) */
export interface FundingPrint {
  time: number;
  rate: Dec;
}

export interface MarketStats {
  market: number;
  markPrice: Dec;
  indexPrice: Dec;
  open24h: Dec;
  volume24h: Dec;
  openInterest: Dec;
  fundingRate: Dec;
  /** unix seconds */
  nextFundingTime: number;
}

export interface BookLevel {
  price: Dec;
  size: Dec;
}

export interface BookSnapshot {
  market: number;
  seq: number;
  /** best first */
  bids: BookLevel[];
  /** best first */
  asks: BookLevel[];
}

/** proto BookDelta. size "0" removes the level */
export interface BookDelta {
  market: number;
  side: Side;
  price: Dec;
  size: Dec;
}

export interface BookUpdate {
  market: number;
  seq: number;
  deltas: BookDelta[];
  /** WS resync: deltas are every live level, replace the book */
  snapshot?: boolean;
}

/** proto Fill + time */
export interface PublicTrade {
  market: number;
  tradeId: Dec;
  price: Dec;
  size: Dec;
  takerSide: Side;
  makerOrderId: Dec;
  maker: string;
  takerOrderId: Dec;
  taker: string;
  /** unix ms */
  time: number;
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  /** unix seconds, bar open */
  time: number;
  open: Dec;
  high: Dec;
  low: Dec;
  close: Dec;
  volume: Dec;
}

export interface Account {
  trader: string;
  collateral: Dec;
  equity: Dec;
  initialMargin: Dec;
  maintenanceMargin: Dec;
}

/** proto PositionUpdate. size signed, long > 0 */
export interface Position {
  trader: string;
  market: number;
  size: Dec;
  entryNotional: Dec;
  realizedPnl: Dec;
}

export interface Order {
  orderId: Dec;
  market: number;
  trader: string;
  side: Side;
  type: OrderType;
  tif: TimeInForce;
  price: Dec;
  size: Dec;
  filled: Dec;
  remaining: Dec;
  reduceOnly: boolean;
  state: OrderState;
  reason: Reason;
  orderHash: string;
  clientId: string;
  /** unix ms */
  createdAt: number;
}

export interface UserFill {
  tradeId: Dec;
  market: number;
  orderId: Dec;
  side: Side;
  price: Dec;
  size: Dec;
  fee: Dec;
  liquidity: "maker" | "taker";
  realizedPnl: Dec;
  time: number;
}

/** one row per position per hourly period; aliases tolerated while gateway shape settles */
export interface FundingPayment {
  market: number;
  rate?: Dec;
  positionSize?: Dec;
  size?: Dec;
  /** signed USDC, > 0 paid by trader */
  payment?: Dec;
  amount?: Dec;
  /** unix ms */
  time?: number;
  block?: number;
}

/** POST /orders body, proto Order */
export interface PlaceOrderRequest {
  trader: string;
  market: number;
  side: Side;
  type: OrderType;
  tif: TimeInForce;
  price: Dec;
  size: Dec;
  reduceOnly: boolean;
  nonce: Dec;
  /** unix ms */
  expiryMs: Dec;
  clientId: string;
  /** sha256(borsh(Order)) hex */
  orderHash: string;
  /** trading key, "ed25519:<base58>" */
  publicKey: string;
  /** ed25519 over order hash, base64 */
  signature: string;
}

/** proto OrderStatus */
export interface OrderStatus {
  market: number;
  orderId: Dec;
  trader: string;
  state: OrderState;
  reason: Reason;
  filled: Dec;
  remaining: Dec;
}

export type UserEvent =
  | { type: "order"; order: Order }
  | { type: "fill"; fill: UserFill }
  | { type: "position"; position: Position }
  | { type: "account"; account: Account }
  | { type: "funding"; payment: FundingPayment };

export type Subscription =
  | { channel: "ticker" }
  | { channel: "book"; market: number }
  | { channel: "trades"; market: number }
  | { channel: "user"; trader: string };

export interface ChannelData {
  ticker: MarketStats;
  book: BookUpdate;
  trades: PublicTrade;
  user: UserEvent;
}

export type SubscriptionHandler<S extends Subscription> = (data: ChannelData[S["channel"]]) => void;
export type LeaderWindow = "24h" | "7d" | "30d" | "all";

/** GET /leaderboard row; USDC 1e6 strings, signed. pnl = realized - fees - funding + unrealized */
export interface LeaderRow {
  trader: string;
  pnl: Dec;
  realized: Dec;
  unrealized: Dec;
  fees: Dec;
  funding: Dec;
  volume: Dec;
  trades: number;
  /** collateral + unrealized */
  equity: Dec;
  /** 0..1 */
  winRate: number;
  /** market ids traded in window */
  markets: number[];
  /** 24 cumulative realized - fees points, oldest first */
  curve: Dec[];
}

export type Unsubscribe = () => void;

export interface PerpApi {
  getMarkets(): Promise<Market[]>;
  getMarketStats(): Promise<MarketStats[]>;
  getBook(market: number, depth?: number): Promise<BookSnapshot>;
  getTrades(market: number, limit?: number): Promise<PublicTrade[]>;
  getCandles(market: number, interval: CandleInterval, limit?: number): Promise<Candle[]>;
  getAccount(trader: string): Promise<Account>;
  getPositions(trader: string): Promise<Position[]>;
  getOrders(trader: string): Promise<Order[]>;
  getFills(trader: string): Promise<UserFill[]>;
  getFunding(trader: string): Promise<FundingPayment[]>;
  getFundingRates(market: number): Promise<FundingPrint[]>;
  getLeaderboard(window: LeaderWindow): Promise<LeaderRow[]>;
  placeOrder(req: PlaceOrderRequest): Promise<OrderStatus>;
  cancelOrder(orderId: string, trader: string): Promise<OrderStatus>;
  subscribe<S extends Subscription>(sub: S, handler: SubscriptionHandler<S>): Unsubscribe;
}

/** Onchain collateral moves. */
export interface CollateralApi {
  walletBalance(trader: string): Promise<bigint>;
  deposit(amount: bigint): Promise<void>;
  withdraw(amount: bigint): Promise<void>;
}

export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
