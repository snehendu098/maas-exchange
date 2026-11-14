package mmbot

import (
	"context"
	"crypto/ed25519"
	"log/slog"
	"math"
	"strconv"
	"time"

	"maas/backend/internal/gateway/api"
)

// Wallet is an account plus its registered trading key.
type Wallet struct {
	Account string
	Key     ed25519.PrivateKey
}

// simTake sends one random IOC taker order per ~SimEvery (exponential gaps), so trades print like real flow.
func (b *Bot) simTake(ctx context.Context, markets []api.Market, idx map[uint32]uint64) error {
	if len(b.Sims) == 0 || time.Now().Before(b.nextSim) {
		return nil
	}
	b.nextSim = time.Now().Add(time.Duration(b.rnd.ExpFloat64() * float64(b.S.SimEvery)))
	w, m := b.Sims[b.rnd.IntN(len(b.Sims))], markets[b.rnd.IntN(len(markets))]
	index := idx[m.ID]
	if index == 0 {
		return nil
	}
	var ps []api.Position
	if err := b.do(ctx, "GET", "/positions?trader="+w.Account, nil, &ps); err != nil {
		return err
	}
	var pos int64
	for _, p := range ps {
		if p.Market == m.ID {
			pos, _ = strconv.ParseInt(p.Size, 10, 64)
		}
	}
	buy := b.rnd.IntN(2) == 0
	if notional := math.Abs(float64(pos)) * float64(index) / 1e8; notional > b.S.SimMax {
		buy = pos < 0 // only reduce past the cap
	}
	size := uint64(b.S.SimNotional*b.rnd.ExpFloat64()*1e8/float64(index)) / m.Lot * m.Lot
	if size == 0 {
		size = m.Lot
	}
	// worst-price guard 1% through index (well inside the gateway band)
	price := uint64(float64(index)*0.99) / m.Tick * m.Tick
	if buy {
		price = uint64(math.Ceil(float64(index)*1.01/float64(m.Tick))) * m.Tick
	}
	err := b.place(ctx, w, m.ID, Quote{buy, price, size}, "ORDER_TYPE_MARKET", "TIME_IN_FORCE_IOC")
	slog.Debug("mmbot: sim take", "wallet", w.Account, "market", m.Symbol, "buy", buy, "size", size, "err", err)
	return err
}
