package pricefeed

import (
	"log/slog"
	"sync"
	"time"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/platform/book"
)

// Marks keeps per-market book levels from engine.out.book.* and a mid-price TWAP.
type Marks struct {
	Window time.Duration
	Index  func(market uint32) (int64, bool) // fallback when no book

	mu     sync.Mutex
	books  book.Books
	twaps  map[uint32]*TWAP
	warned map[uint32]bool
}

// OnBook applies a delta (size = level total, 0 = gone), then samples mid=(bid+ask)/2 at receive time.
func (m *Marks) OnBook(d *perpv1.BookDelta, at time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.books == nil {
		m.books, m.twaps = book.Books{}, map[uint32]*TWAP{}
	}
	bid, ask := m.books.Apply(d).Best()
	if bid == 0 || ask == 0 {
		delete(m.twaps, d.Market) // no two-sided book => Mark falls back to index
		return
	}
	w := m.twaps[d.Market]
	if w == nil {
		w = &TWAP{Window: m.Window}
		m.twaps[d.Market] = w
	}
	w.Add(at, int64((bid+ask)/2))
}

// Mark returns the mid TWAP, or the index if no book data in window.
func (m *Marks) Mark(market uint32, now time.Time) (int64, bool) {
	m.mu.Lock()
	if w := m.twaps[market]; w != nil {
		if v, ok := w.Value(now); ok {
			m.mu.Unlock()
			return v, true
		}
	}
	if m.warned == nil {
		m.warned = map[uint32]bool{}
	}
	if !m.warned[market] {
		m.warned[market] = true
		slog.Warn("mark: no book, using index (funding rate 0)", "market", market)
	}
	m.mu.Unlock()
	return m.Index(market)
}
