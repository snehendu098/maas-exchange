package mmbot

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"math"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"

	"maas/backend/internal/gateway/api"
	"maas/backend/internal/platform/gwclient"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
)

const ttl = time.Hour // order expiry; requote at ttl/2

// Bot quotes every gateway market as a normal signed-order trader.
type Bot struct {
	S    Settings
	Self Wallet // maker account + trading key
	HTTP *http.Client

	Sims []Wallet // taker wallets (orders signed by their own keys)

	nonce   uint64
	pace    *time.Ticker
	last    map[uint32]quoted
	rnd     *rand.Rand
	nextSim time.Time
	basis   map[uint32]*Basis
	lastAt  time.Time
}

// quoted is a market's quote anchor: ladder is rebuilt from it until index/inventory drift or ttl/2.
type quoted struct {
	index uint64
	pos   int64
	sh    *Shape
	at    time.Time
}

func (b *Bot) Run(ctx context.Context) error {
	b.nonce, b.last = uint64(time.Now().UnixNano()), map[uint32]quoted{}
	b.rnd = rand.New(rand.NewPCG(uint64(time.Now().UnixNano()), 7))
	b.basis, b.lastAt = map[uint32]*Basis{}, time.Now()
	b.pace = time.NewTicker(time.Duration(float64(time.Second) / b.S.RPS))
	defer b.pace.Stop()
	markets, err := b.gw().Markets(ctx)
	if err != nil {
		return err
	}
	slog.Info("mmbot: quoting", "trader", b.Self.Account, "markets", len(markets), "sims", len(b.Sims))
	for {
		if err := b.tick(ctx, markets); err != nil && ctx.Err() == nil {
			slog.Warn("mmbot: tick", "err", err)
		}
		select { // gap uniform in [Every, 2*Every)
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(b.S.Every + time.Duration(b.rnd.Int64N(int64(b.S.Every)))):
		}
	}
}

func (b *Bot) tick(ctx context.Context, markets []api.Market) error {
	var stats []api.MarketStats
	var positions []api.Position
	var orders []api.Order
	q := "?trader=" + b.Self.Account
	for path, v := range map[string]any{"/markets/stats": &stats, "/positions" + q: &positions, "/orders" + q: &orders} {
		if err := b.do(ctx, "GET", path, nil, v); err != nil {
			return err
		}
	}
	idx, pos, open := map[uint32]uint64{}, map[uint32]int64{}, map[uint32][]api.Order{}
	for _, s := range stats {
		idx[s.Market], _ = strconv.ParseUint(s.IndexPrice, 10, 64)
	}
	for _, p := range positions {
		pos[p.Market], _ = strconv.ParseInt(p.Size, 10, 64)
	}
	for _, o := range orders {
		open[o.Market] = append(open[o.Market], o)
	}
	dt := time.Since(b.lastAt).Seconds()
	b.lastAt = time.Now()
	for _, m := range markets {
		if idx[m.ID] == 0 {
			continue
		}
		bs := b.basis[m.ID]
		if bs == nil {
			bs = &Basis{Bps: b.S.BasisMean, Mean: b.S.BasisMean, Std: b.S.BasisStd, Tau: b.S.BasisTau.Seconds()}
			b.basis[m.ID] = bs
		}
		bs.Step(dt, b.rnd.NormFloat64())
		center := uint64(float64(idx[m.ID]) * (1 + bs.Bps/1e4)) // quote off index + simulated premium
		l, ok := b.last[m.ID]
		invMoved := math.Abs(float64(pos[m.ID]-l.pos))*float64(center)/1e8 > b.S.MaxNotional/10
		if fresh := !ok || time.Since(l.at) > ttl/2; fresh || invMoved || Stale(l.index, center, b.S.ReplaceBps) {
			if fresh {
				l.sh, l.at = NewShape(b.S.Params, b.rnd.Float64), time.Now()
			}
			l.index, l.pos = center, pos[m.ID]
			b.last[m.ID] = l
		} else {
			l.sh.Mutate(b.S.Params, b.rnd.Float64)
		}
		b.reconcile(ctx, m, Quotes(l.index, m.Tick, m.Lot, l.pos, b.S.Params, l.sh), open[m.ID])
	}
	return b.simTake(ctx, markets, idx)
}

// reconcile diffs the ladder against our open orders by (side, price): filled levels refill, unchanged stay.
// New quotes go in before stale ones leave (no empty book), except stale ones they would cross.
func (b *Bot) reconcile(ctx context.Context, m api.Market, want []Quote, open []api.Order) {
	key := func(buy bool, px uint64) string { return fmt.Sprint(buy, px) }
	have, wanted := map[string]string{}, map[string]bool{}
	maxBid, minAsk := uint64(0), uint64(math.MaxUint64)
	for _, q := range want {
		wanted[key(q.Buy, q.Price)] = true
		if q.Buy {
			maxBid = max(maxBid, q.Price)
		} else {
			minAsk = min(minAsk, q.Price)
		}
	}
	crossed := map[string]bool{}
	for _, o := range open {
		px, _ := strconv.ParseUint(o.Price, 10, 64)
		buy, k := o.Side == "SIDE_BUY", key(o.Side == "SIDE_BUY", px)
		have[k] = o.OrderID
		crossed[k] = !wanted[k] && (buy && px >= minAsk || !buy && px <= maxBid)
	}
	cancel := func(stale func(k string) bool) {
		for k, id := range have {
			if !stale(k) {
				continue
			}
			if err := b.do(ctx, "DELETE", "/orders/"+id+"?trader="+b.Self.Account, nil, nil); err != nil {
				slog.Warn("mmbot: cancel", "market", m.Symbol, "order", id, "err", err)
			}
			delete(have, k)
		}
	}
	cancel(func(k string) bool { return crossed[k] })
	for _, q := range want {
		if _, ok := have[key(q.Buy, q.Price)]; ok {
			continue
		}
		if err := b.place(ctx, b.Self, m.ID, q, "ORDER_TYPE_LIMIT", "TIME_IN_FORCE_GTC"); err != nil {
			slog.Warn("mmbot: place", "market", m.Symbol, "quote", q, "err", err)
		}
	}
	cancel(func(k string) bool { return !wanted[k] })
}

func (b *Bot) place(ctx context.Context, w Wallet, market uint32, q Quote, typ, tif string) error {
	b.nonce++
	o := sign.Order{Trader: w.Account, MarketID: market, IsBuy: q.Buy, Price: q.Price, Size: q.Size,
		Nonce: b.nonce, ExpiryMs: uint64(time.Now().Add(ttl).UnixMilli())}
	h, sig := sign.SignOrder(o, w.Key)
	side := map[bool]string{true: "SIDE_BUY", false: "SIDE_SELL"}[q.Buy]
	return b.do(ctx, "POST", "/orders", api.PlaceOrderRequest{
		Trader: w.Account, Market: market, Side: side, Type: typ, Tif: tif,
		Price: fmt.Sprint(q.Price), Size: fmt.Sprint(q.Size), Nonce: fmt.Sprint(b.nonce), ExpiryMs: fmt.Sprint(o.ExpiryMs),
		ClientID: "mmbot", OrderHash: hex.EncodeToString(h[:]), Signature: base64.StdEncoding.EncodeToString(sig),
		PublicKey: near.PublicKeyString(w.Key.Public().(ed25519.PublicKey)),
	}, nil)
}

// do calls the gateway; writes wait on pace.
func (b *Bot) do(ctx context.Context, method, path string, in, out any) error {
	if method != "GET" {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-b.pace.C:
		}
	}
	return b.gw().Do(ctx, method, path, in, out)
}

func (b *Bot) gw() gwclient.Client { return gwclient.Client{Base: b.S.Gateway, HTTP: b.HTTP} }
