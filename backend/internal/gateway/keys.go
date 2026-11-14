package gateway

import (
	"context"
	"sync"
	"time"
)

// keyCache memoizes trading_keys views per trader for ttl.
// shortcut: removed keys stay accepted up to ttl; settle rejects them onchain anyway.
type keyCache struct {
	fetch func(ctx context.Context, trader string) ([]string, error)
	ttl   time.Duration

	mu sync.Mutex
	m  map[string]keyEntry
}

type keyEntry struct {
	keys []string
	at   time.Time
}

func (c *keyCache) Get(ctx context.Context, trader string) ([]string, error) {
	c.mu.Lock()
	e, ok := c.m[trader]
	c.mu.Unlock()
	if ok && time.Since(e.at) < c.ttl {
		return e.keys, nil
	}
	ks, err := c.fetch(ctx, trader)
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.m[trader] = keyEntry{ks, time.Now()}
	c.mu.Unlock()
	return ks, nil
}
