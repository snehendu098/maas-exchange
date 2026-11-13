// Package pricefeed keeps latest index (Pyth) and mark (engine TWAP) prices.
package pricefeed

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"maas/backend/internal/platform/oracle"
)

// MaxAge drops index snapshots older than this.
const MaxAge = 60 * time.Second

// Source yields index prices (Hermes or mock).
type Source interface {
	Latest(ctx context.Context) (oracle.Snapshot, error)
}

// Feed polls a Source and caches the latest snapshot.
type Feed struct {
	Src    Source
	OnPoll func(context.Context, oracle.Snapshot) // optional, after each successful Run poll

	mu   sync.RWMutex
	last oracle.Snapshot
}

// Poll fetches once and caches on success.
func (f *Feed) Poll(ctx context.Context) error {
	s, err := f.Src.Latest(ctx)
	if err != nil {
		return err
	}
	f.mu.Lock()
	f.last = s
	f.mu.Unlock()
	return nil
}

// Run polls now, then every interval until ctx ends.
func (f *Feed) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := f.Poll(ctx); err != nil {
			slog.Warn("pricefeed poll", "err", err)
		} else if f.OnPoll != nil {
			f.OnPoll(ctx, f.Snapshot())
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Snapshot returns the latest snapshot, or zero if older than MaxAge.
func (f *Feed) Snapshot() oracle.Snapshot {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if time.Since(f.last.PublishTime) > MaxAge {
		return oracle.Snapshot{}
	}
	return f.last
}

// Index returns the latest fresh index price for market.
func (f *Feed) Index(market uint32) (int64, bool) {
	p, ok := f.Snapshot().Prices[market]
	return p, ok && p > 0
}
