package fake

import (
	"context"
	"errors"
	"sync"
	"time"

	vk "maas/backend/internal/vaultkeeper"
	"maas/backend/internal/vaultkeeper/sizing"
)

// Perp fills IOC orders at index in full and settles them on chain after SettleDelay.
// Fills per order identity are capped at size, like exchange filled[hash].
type Perp struct {
	mu          sync.Mutex
	Clock       *Clock
	Specs       []vk.Spec
	Prices      map[uint32]int64
	SettleDelay time.Duration
	FailPlace   int  // reject the next n Place calls
	NoFill      bool // IOC finds no liquidity

	col     int64
	pos     map[uint32]int64
	filled  map[vk.Order]int64
	pending []fill
	Placed  []vk.Order
}

type fill struct {
	market uint32
	delta  int64
	at     time.Time
}

func NewPerp(c *Clock, specs []vk.Spec, prices map[uint32]int64) *Perp {
	return &Perp{Clock: c, Specs: specs, Prices: prices, pos: map[uint32]int64{}, filled: map[vk.Order]int64{}}
}

func (p *Perp) Markets(context.Context) ([]vk.Spec, error) { return p.Specs, nil }

func (p *Perp) Index(context.Context) (map[uint32]int64, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := map[uint32]int64{}
	for k, v := range p.Prices {
		out[k] = v
	}
	return out, nil
}

func (p *Perp) Position(_ context.Context, m uint32) (int64, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.settle()
	return p.pos[m], nil
}

func (p *Perp) Collateral(context.Context) (int64, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.col, nil
}

func (p *Perp) Place(_ context.Context, o vk.Order) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Placed = append(p.Placed, o)
	if p.FailPlace > 0 {
		p.FailPlace--
		return errors.New("fake: gateway rejected")
	}
	idx := p.Prices[o.Market]
	if p.NoFill || o.Buy && o.Price < idx || !o.Buy && o.Price > idx {
		return nil
	}
	if !o.Buy && sizing.Margin(sizing.Notional(-p.projected(o.Market)+o.Size, idx, true), 1e6) > p.col {
		return errors.New("fake: insufficient margin")
	}
	sz := o.Size - p.filled[o]
	if o.ReduceOnly {
		sz = min(sz, max(-p.projected(o.Market), 0))
	}
	if sz <= 0 {
		return nil
	}
	p.filled[o] += sz
	if !o.Buy {
		sz = -sz
	}
	p.pending = append(p.pending, fill{o.Market, sz, p.Clock.Now().Add(p.SettleDelay)})
	return nil
}

// Effective is how many distinct orders actually filled.
func (p *Perp) Effective() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.filled)
}

func (p *Perp) AddCollateral(d int64) {
	p.mu.Lock()
	p.col += d
	p.mu.Unlock()
}

func (p *Perp) Col() int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.col
}

// projected is position including unsettled fills.
func (p *Perp) projected(m uint32) int64 {
	n := p.pos[m]
	for _, f := range p.pending {
		if f.market == m {
			n += f.delta
		}
	}
	return n
}

func (p *Perp) settle() {
	now, keep := p.Clock.Now(), p.pending[:0]
	for _, f := range p.pending {
		if f.at.After(now) {
			keep = append(keep, f)
			continue
		}
		p.pos[f.market] += f.delta
	}
	p.pending = keep
}
