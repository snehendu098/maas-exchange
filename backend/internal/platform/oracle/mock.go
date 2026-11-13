package oracle

import (
	"context"
	"maps"
	"sync"
	"time"
)

// Mock is a fixed price source for local dev; Set moves a price.
type Mock struct {
	mu     sync.Mutex
	prices map[uint32]int64
}

// NewMock seeds a Mock with USDC 1e6 prices by market id.
func NewMock(prices map[uint32]int64) *Mock { return &Mock{prices: maps.Clone(prices)} }

func (m *Mock) Set(market uint32, priceE6 int64) {
	m.mu.Lock()
	m.prices[market] = priceE6
	m.mu.Unlock()
}

// Latest stamps every price with now.
func (m *Mock) Latest(context.Context) (Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	s := Snapshot{Prices: maps.Clone(m.prices), Published: map[uint32]time.Time{}, PublishTime: now}
	for id := range m.prices {
		s.Published[id] = now
	}
	return s, nil
}
