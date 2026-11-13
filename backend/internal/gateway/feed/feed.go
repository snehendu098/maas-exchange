// Package feed folds replayed engine streams into in-memory book, trades, fills, orders and index.
package feed

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"math/big"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/platform/book"
	"maas/backend/internal/platform/bus"
)

// History caps trades per market and fills per trader.
const History = 500

// Feed state is rebuilt by replaying ENGINE_OUT + engine.in.chain from seq 1 at boot.
// shortcut: full replay into memory, snapshot to db if streams outgrow RAM / boot time.
type Feed struct {
	Markets map[uint32]api.Market
	Publish func(key string, data any)                                   // ws fan-out
	OrderAt func(ctx context.Context, seq uint64) (*perpv1.Order, error) // ENGINE_IN lookup
	OnChain func(trader string, market int)                              // onchain position (market) / balance (-1) changed

	mu      sync.RWMutex
	books   book.Books
	bookSeq map[uint32]uint64
	orders  map[uint64]*api.Order
	trades  map[uint32][]api.PublicTrade // newest first
	fills   map[string][]api.UserFill    // newest first
	index   map[uint32]uint64
}

func New(markets map[uint32]api.Market) *Feed {
	return &Feed{
		Markets: markets, Publish: func(string, any) {}, OnChain: func(string, int) {},
		books: book.Books{}, bookSeq: map[uint32]uint64{}, orders: map[uint64]*api.Order{},
		trades: map[uint32][]api.PublicTrade{}, fills: map[string][]api.UserFill{}, index: map[uint32]uint64{},
	}
}

// Run replays + tails both streams until ctx ends.
func (f *Feed) Run(ctx context.Context, js jetstream.JetStream) {
	var wg sync.WaitGroup
	wg.Go(func() { consume(ctx, js, bus.EngineOutStream, "engine.out.>", f.OnOut) })
	wg.Go(func() { consume(ctx, js, bus.EngineInStream, bus.EngineInChain, f.OnIn) })
	wg.Wait()
}

// consume retries until the stream exists (engine creates ENGINE_OUT).
func consume(ctx context.Context, js jetstream.JetStream, stream, subj string, fn func(context.Context, uint64, time.Time, []byte)) {
	for ctx.Err() == nil {
		c, err := js.OrderedConsumer(ctx, stream, jetstream.OrderedConsumerConfig{FilterSubjects: []string{subj}})
		var cc jetstream.ConsumeContext
		if err == nil {
			cc, err = c.Consume(func(m jetstream.Msg) {
				md, err := m.Metadata()
				if err != nil {
					return
				}
				fn(ctx, md.Sequence.Stream, md.Timestamp, m.Data())
			})
		}
		if err == nil {
			<-ctx.Done()
			cc.Stop()
			return
		}
		slog.Warn("feed: consumer", "stream", stream, "err", err)
		select {
		case <-ctx.Done():
		case <-time.After(2 * time.Second):
		}
	}
}

// OnIn applies one engine.in.chain message (index, onchain user changes).
func (f *Feed) OnIn(_ context.Context, _ uint64, _ time.Time, data []byte) {
	var u perpv1.ChainUpdate
	if proto.Unmarshal(data, &u) != nil {
		return
	}
	switch {
	case u.GetMark() != nil:
		f.mu.Lock()
		f.index[u.GetMark().Market] = u.GetMark().Price
		f.mu.Unlock()
	case u.GetPosition() != nil:
		f.OnChain(u.GetPosition().Trader, int(u.GetPosition().Market))
	case u.GetBalance() != nil:
		f.OnChain(u.GetBalance().Trader, -1)
	}
}

// OnOut applies one ENGINE_OUT message (seq = stream seq) then fans it out.
func (f *Feed) OnOut(ctx context.Context, seq uint64, at time.Time, data []byte) {
	var out perpv1.EngineOutput
	if err := proto.Unmarshal(data, &out); err != nil {
		slog.Warn("feed: bad engine output", "seq", seq, "err", err)
		return
	}
	switch {
	case out.GetBook() != nil:
		d := out.GetBook()
		f.mu.Lock()
		f.books.Apply(d)
		f.bookSeq[d.Market] = seq
		f.mu.Unlock()
		f.Publish(fmt.Sprint("book:", d.Market), api.BookUpdate{Market: d.Market, Seq: seq, Deltas: []api.BookDelta{delta(d)}})
	case out.GetFill() != nil:
		f.onFill(out.GetFill(), at)
	case out.GetStatus() != nil:
		f.onStatus(ctx, out.GetStatus(), at)
	}
}

func (f *Feed) onFill(x *perpv1.Fill, at time.Time) {
	t := api.PublicTrade{
		Market: x.Market, TradeID: u64(x.TradeId), Price: u64(x.Price), Size: u64(x.Size), TakerSide: x.TakerSide.String(),
		MakerOrderID: u64(x.MakerOrderId), Maker: x.Maker, TakerOrderID: u64(x.TakerOrderId), Taker: x.Taker,
		Time: at.UnixMilli(),
	}
	m := f.Markets[x.Market]
	makerSide := perpv1.Side_SIDE_BUY
	if x.TakerSide == perpv1.Side_SIDE_BUY {
		makerSide = perpv1.Side_SIDE_SELL
	}
	fill := func(order uint64, side perpv1.Side, bps uint64, liq string) api.UserFill {
		return api.UserFill{
			TradeID: t.TradeID, Market: x.Market, OrderID: u64(order), Side: side.String(), Price: t.Price, Size: t.Size,
			Fee: Fee(x.Price, x.Size, bps), Liquidity: liq, RealizedPnl: "0", Time: t.Time,
		}
	}
	mf, tf := fill(x.MakerOrderId, makerSide, m.MakerFeeBps, "maker"), fill(x.TakerOrderId, x.TakerSide, m.TakerFeeBps, "taker")
	f.mu.Lock()
	f.trades[x.Market] = prepend(f.trades[x.Market], t)
	f.fills[t.Maker] = prepend(f.fills[t.Maker], mf)
	f.fills[t.Taker] = prepend(f.fills[t.Taker], tf)
	f.mu.Unlock()
	f.Publish(fmt.Sprint("trades:", x.Market), t)
	f.Publish("user:"+t.Maker, api.UserEvent{Type: "fill", Fill: &mf})
	f.Publish("user:"+t.Taker, api.UserEvent{Type: "fill", Fill: &tf})
}

func (f *Feed) onStatus(ctx context.Context, s *perpv1.OrderStatus, at time.Time) {
	if s.State == perpv1.OrderState_ORDER_STATE_CANCEL_REJECTED {
		return // order itself unchanged
	}
	f.mu.RLock()
	o := f.orders[s.OrderId]
	f.mu.RUnlock()
	if o == nil {
		o = f.load(ctx, s, at)
	}
	f.mu.Lock()
	o.State, o.Reason = s.State.String(), s.Reason.String()
	o.Filled, o.Remaining = u64(s.Filled), u64(s.Remaining)
	f.orders[s.OrderId] = o
	cp := *o
	f.mu.Unlock()
	f.Publish("user:"+cp.Trader, api.UserEvent{Type: "order", Order: &cp})
}

// load builds an Order from its ENGINE_IN input; status-only fields if lookup fails.
func (f *Feed) load(ctx context.Context, s *perpv1.OrderStatus, at time.Time) *api.Order {
	o := &api.Order{OrderID: u64(s.OrderId), Market: s.Market, Trader: s.Trader, Size: u64(s.Filled + s.Remaining), CreatedAt: at.UnixMilli()}
	in, err := f.OrderAt(ctx, s.OrderId)
	if err != nil {
		slog.Warn("feed: order lookup", "id", s.OrderId, "err", err)
		return o
	}
	o.Side, o.Type, o.Tif = in.Side.String(), in.Type.String(), in.Tif.String()
	o.Price, o.Size, o.ReduceOnly = u64(in.Price), u64(in.Size), in.ReduceOnly
	o.OrderHash, o.ClientID = hex.EncodeToString(in.OrderHash), in.ClientId
	return o
}

// Snapshot is the WS resync payload for key (book:<id> only), nil otherwise.
func (f *Feed) Snapshot(key string) any {
	id, ok := strings.CutPrefix(key, "book:")
	if !ok {
		return nil
	}
	m, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		return nil
	}
	b := f.Book(uint32(m), 0)
	u := api.BookUpdate{Market: b.Market, Seq: b.Seq, Snapshot: true, Deltas: []api.BookDelta{}}
	for side, lv := range map[string][]api.BookLevel{"SIDE_BUY": b.Bids, "SIDE_SELL": b.Asks} {
		for _, l := range lv {
			u.Deltas = append(u.Deltas, api.BookDelta{Market: b.Market, Side: side, Price: l.Price, Size: l.Size})
		}
	}
	return u
}

// Book returns depth levels per side (0 = all).
func (f *Feed) Book(market uint32, depth int) api.BookSnapshot {
	f.mu.RLock()
	defer f.mu.RUnlock()
	s := api.BookSnapshot{Market: market, Seq: f.bookSeq[market], Bids: []api.BookLevel{}, Asks: []api.BookLevel{}}
	if b := f.books[market]; b != nil {
		bids, asks := b.Levels(depth)
		s.Bids, s.Asks = levels(bids), levels(asks)
	}
	return s
}

// Mid is (best bid + best ask)/2, ok=false if one-sided.
func (f *Feed) Mid(market uint32) (uint64, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if b := f.books[market]; b != nil {
		if bid, ask := b.Best(); bid > 0 && ask > 0 {
			return (bid + ask) / 2, true
		}
	}
	return 0, false
}

// Index is the latest keeper MarkPrice (oracle index).
func (f *Feed) Index(market uint32) (uint64, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	p, ok := f.index[market]
	return p, ok
}

func (f *Feed) Trades(market uint32, limit int) []api.PublicTrade {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return head(f.trades[market], limit)
}

func (f *Feed) Fills(trader string, limit int) []api.UserFill {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return head(f.fills[trader], limit)
}

// OpenOrders newest first. shortcut: scans all orders, index by trader if it grows.
func (f *Feed) OpenOrders(trader string) []api.Order {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := []api.Order{}
	for _, o := range f.orders {
		if o.Trader == trader && o.Open() {
			out = append(out, *o)
		}
	}
	slices.SortFunc(out, func(a, b api.Order) int { return int(b.CreatedAt - a.CreatedAt) })
	return out
}

// Order returns a copy of a known order.
func (f *Feed) Order(id uint64) (api.Order, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if o := f.orders[id]; o != nil {
		return *o, true
	}
	return api.Order{}, false
}

// Fee = ceil(price*size/1e8 * bps / 1e4), mirrors exchange fee rounding on notional (ignores fee_exempt).
func Fee(price, size, bps uint64) string {
	q := new(big.Int).Mul(new(big.Int).SetUint64(price), new(big.Int).SetUint64(size))
	q.Quo(q, big.NewInt(1e8))
	q.Mul(q, new(big.Int).SetUint64(bps))
	q.Add(q, big.NewInt(9999))
	return q.Quo(q, big.NewInt(1e4)).String()
}

func delta(d *perpv1.BookDelta) api.BookDelta {
	return api.BookDelta{Market: d.Market, Side: d.Side.String(), Price: u64(d.Price), Size: u64(d.Size)}
}

func levels(ls []book.Level) []api.BookLevel {
	out := make([]api.BookLevel, len(ls))
	for i, l := range ls {
		out[i] = api.BookLevel{Price: u64(l.Price), Size: u64(l.Size)}
	}
	return out
}

func prepend[T any](s []T, v T) []T {
	s = append([]T{v}, s...)
	return s[:min(len(s), History)]
}

func head[T any](s []T, n int) []T {
	if n <= 0 || n > len(s) {
		n = len(s)
	}
	return append([]T{}, s[:n]...)
}

func u64(v uint64) string { return strconv.FormatUint(v, 10) }
