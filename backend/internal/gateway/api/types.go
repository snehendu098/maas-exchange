// Package api is the gateway JSON wire contract (mirrors client/src/features/perp/api/types.ts).
// Amounts = base-10 strings, accounts = NEAR account ids, times = unix ms unless noted.
package api

type Market struct {
	ID          uint32 `json:"id"`
	Symbol      string `json:"symbol"`
	TickSize    string `json:"tickSize"`
	LotSize     string `json:"lotSize"`
	ImrBps      uint64 `json:"imrBps"`
	MmrBps      uint64 `json:"mmrBps"`
	MakerFeeBps uint64 `json:"makerFeeBps"`
	TakerFeeBps uint64 `json:"takerFeeBps"`

	Tick, Lot uint64 `json:"-"`
}

type MarketStats struct {
	Market          uint32 `json:"market"`
	MarkPrice       string `json:"markPrice"`
	IndexPrice      string `json:"indexPrice"`
	Open24h         string `json:"open24h"`
	Volume24h       string `json:"volume24h"`
	OpenInterest    string `json:"openInterest"`
	FundingRate     string `json:"fundingRate"`
	NextFundingTime int64  `json:"nextFundingTime"` // unix seconds
}

type BookLevel struct {
	Price string `json:"price"`
	Size  string `json:"size"`
}

type BookSnapshot struct {
	Market uint32      `json:"market"`
	Seq    uint64      `json:"seq"`
	Bids   []BookLevel `json:"bids"`
	Asks   []BookLevel `json:"asks"`
}

type BookDelta struct {
	Market uint32 `json:"market"`
	Side   string `json:"side"`
	Price  string `json:"price"`
	Size   string `json:"size"`
}

// BookUpdate; Snapshot=true carries every live level (WS subscribe resync).
type BookUpdate struct {
	Market   uint32      `json:"market"`
	Seq      uint64      `json:"seq"`
	Deltas   []BookDelta `json:"deltas"`
	Snapshot bool        `json:"snapshot,omitempty"`
}

type PublicTrade struct {
	Market       uint32 `json:"market"`
	TradeID      string `json:"tradeId"`
	Price        string `json:"price"`
	Size         string `json:"size"`
	TakerSide    string `json:"takerSide"`
	MakerOrderID string `json:"makerOrderId"`
	Maker        string `json:"maker"`
	TakerOrderID string `json:"takerOrderId"`
	Taker        string `json:"taker"`
	Time         int64  `json:"time"`
}

type Candle struct {
	Time   int64  `json:"time"` // unix seconds, bar open
	Open   string `json:"open"`
	High   string `json:"high"`
	Low    string `json:"low"`
	Close  string `json:"close"`
	Volume string `json:"volume"`
}

type Account struct {
	Trader            string `json:"trader"`
	Collateral        string `json:"collateral"`
	Equity            string `json:"equity"`
	InitialMargin     string `json:"initialMargin"`
	MaintenanceMargin string `json:"maintenanceMargin"`
}

type Position struct {
	Trader        string `json:"trader"`
	Market        uint32 `json:"market"`
	Size          string `json:"size"`
	EntryNotional string `json:"entryNotional"`
	RealizedPnl   string `json:"realizedPnl"`
}

type Order struct {
	OrderID    string `json:"orderId"`
	Market     uint32 `json:"market"`
	Trader     string `json:"trader"`
	Side       string `json:"side"`
	Type       string `json:"type"`
	Tif        string `json:"tif"`
	Price      string `json:"price"`
	Size       string `json:"size"`
	Filled     string `json:"filled"`
	Remaining  string `json:"remaining"`
	ReduceOnly bool   `json:"reduceOnly"`
	State      string `json:"state"`
	Reason     string `json:"reason"`
	OrderHash  string `json:"orderHash"`
	ClientID   string `json:"clientId"`
	CreatedAt  int64  `json:"createdAt"`
}

type UserFill struct {
	TradeID     string `json:"tradeId"`
	Market      uint32 `json:"market"`
	OrderID     string `json:"orderId"`
	Side        string `json:"side"`
	Price       string `json:"price"`
	Size        string `json:"size"`
	Fee         string `json:"fee"`
	Liquidity   string `json:"liquidity"`
	RealizedPnl string `json:"realizedPnl"`
	Time        int64  `json:"time"`
}

type FundingPayment struct {
	Market       uint32 `json:"market"`
	Rate         string `json:"rate"`
	PositionSize string `json:"positionSize"`
	Payment      string `json:"payment"` // > 0 paid by trader
	Time         int64  `json:"time"`    // unix ms
	Block        uint64 `json:"block"`
}

// LeaderRow is one trader's window stats; USDC 1e6 strings, signed.
// Pnl = Realized - Fees - Funding + Unrealized (open positions at last trade price).
type LeaderRow struct {
	Trader     string   `json:"trader"`
	Pnl        string   `json:"pnl"`
	Realized   string   `json:"realized"`
	Unrealized string   `json:"unrealized"`
	Fees       string   `json:"fees"`
	Funding    string   `json:"funding"` // > 0 paid
	Volume     string   `json:"volume"`
	Trades     int64    `json:"trades"`
	Equity     string   `json:"equity"`  // collateral + unrealized, now
	WinRate    float64  `json:"winRate"` // share of closing updates with realized > 0
	Markets    []int32  `json:"markets"` // market ids traded in window
	Curve      []string `json:"curve"`   // 24 cumulative realized - fees points, oldest first
}

// FundingRate is one FundingUpdated print.
type FundingRate struct {
	Time     int64  `json:"time"` // unix seconds
	Rate     string `json:"rate"`
	Block    uint64 `json:"block"`
	LogIndex uint32 `json:"logIndex"`
}

type PlaceOrderRequest struct {
	Trader     string `json:"trader"`
	Market     uint32 `json:"market"`
	Side       string `json:"side"`
	Type       string `json:"type"`
	Tif        string `json:"tif"`
	Price      string `json:"price"`
	Size       string `json:"size"`
	ReduceOnly bool   `json:"reduceOnly"`
	Nonce      string `json:"nonce"`
	ExpiryMs   string `json:"expiryMs"`
	ClientID   string `json:"clientId"`
	OrderHash  string `json:"orderHash"`
	Signature  string `json:"signature"` // base64 64-byte ed25519
	PublicKey  string `json:"publicKey"` // "ed25519:<base58>" trading key
}

type OrderStatus struct {
	Market    uint32 `json:"market"`
	OrderID   string `json:"orderId"`
	Trader    string `json:"trader"`
	State     string `json:"state"`
	Reason    string `json:"reason"`
	Filled    string `json:"filled"`
	Remaining string `json:"remaining"`
}

// UserEvent is a tagged union keyed by Type: order|fill|position|account|funding.
type UserEvent struct {
	Type     string    `json:"type"`
	Order    *Order    `json:"order,omitempty"`
	Fill     *UserFill `json:"fill,omitempty"`
	Position *Position `json:"position,omitempty"`
	Account  *Account  `json:"account,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Status projects an Order to its OrderStatus.
func (o *Order) Status() OrderStatus {
	return OrderStatus{o.Market, o.OrderID, o.Trader, o.State, o.Reason, o.Filled, o.Remaining}
}

// Open mirrors client OPEN_STATES.
func (o *Order) Open() bool {
	return o.State == "ORDER_STATE_ACCEPTED" || o.State == "ORDER_STATE_RESTING" || o.State == "ORDER_STATE_PARTIALLY_FILLED"
}
