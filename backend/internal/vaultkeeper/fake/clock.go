package fake

import (
	"context"
	"sync"
	"time"

	vk "maas/backend/internal/vaultkeeper"
)

// Clock is a manual clock.
type Clock struct {
	mu sync.Mutex
	t  time.Time
}

func NewClock(t time.Time) *Clock { return &Clock{t: t} }

func (c *Clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *Clock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// Alerts records every alert.
type Alerts struct {
	mu  sync.Mutex
	All []vk.Alert
}

func (a *Alerts) Alert(_ context.Context, al vk.Alert) {
	a.mu.Lock()
	a.All = append(a.All, al)
	a.mu.Unlock()
}

// Count is alerts at or above lvl.
func (a *Alerts) Count(lvl vk.Level) int {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, x := range a.All {
		if x.Level >= lvl {
			n++
		}
	}
	return n
}
