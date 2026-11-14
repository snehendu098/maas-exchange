package funding

import (
	"context"
	"log/slog"
	"math/big"
	"sync"
	"time"
)

// Poster sends updateFunding onchain.
type Poster interface {
	UpdateFunding(ctx context.Context, market uint32, rate *big.Int) error
}

// Funder computes and posts funding for each market.
type Funder struct {
	Markets  []uint32
	Interval time.Duration
	Cap      *big.Int // per-period, Scale units
	Interest int64    // base rate, bps/day
	Mark     func(market uint32, now time.Time) (int64, bool)
	Index    func(market uint32) (int64, bool)
	Poster   Poster

	mu    sync.RWMutex
	rates map[uint32]*big.Int
}

// PeriodsPerDay for the configured interval (min 1).
func (f *Funder) PeriodsPerDay() int64 {
	return max(int64(24*time.Hour/f.Interval), 1)
}

// Tick posts one round. Markets missing a price are skipped.
func (f *Funder) Tick(ctx context.Context) {
	now := time.Now()
	for _, m := range f.Markets {
		idx, ok1 := f.Index(m)
		mark, ok2 := f.Mark(m, now)
		if !ok1 || !ok2 {
			slog.Warn("funding: no price", "market", m)
			continue
		}
		r := Rate(mark, idx, f.PeriodsPerDay(), f.Interest, f.Cap)
		if err := f.Poster.UpdateFunding(ctx, m, r); err != nil {
			slog.Error("funding: post", "market", m, "err", err)
			continue
		}
		f.mu.Lock()
		if f.rates == nil {
			f.rates = map[uint32]*big.Int{}
		}
		f.rates[m] = r
		f.mu.Unlock()
		slog.Info("funding posted", "market", m, "mark", mark, "index", idx, "rate", r)
	}
}

// Run ticks on wall-clock Interval boundaries (matches gateway countdown) until ctx ends.
func (f *Funder) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(NextBoundary(time.Now(), f.Interval))):
			f.Tick(ctx)
		}
	}
}

// NextBoundary is the first multiple of every after now.
func NextBoundary(now time.Time, every time.Duration) time.Time {
	return now.Truncate(every).Add(every)
}

// Rates returns the last posted rate per market (for the recorder).
func (f *Funder) Rates() map[uint32]*big.Int {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make(map[uint32]*big.Int, len(f.rates))
	for m, r := range f.rates {
		out[m] = new(big.Int).Set(r)
	}
	return out
}
