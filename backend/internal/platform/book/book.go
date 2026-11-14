// Package book rebuilds L2 price levels from engine BookDelta events.
package book

import (
	"cmp"
	"slices"

	perpv1 "maas/backend/gen/perp/v1"
)

// Book levels: price -> total size.
type Book struct{ Bids, Asks map[uint64]uint64 }

// Books is per-market books.
type Books map[uint32]*Book

// Apply sets a level (size = new level total, 0 = gone); returns the market's book.
func (bs Books) Apply(d *perpv1.BookDelta) *Book {
	b := bs[d.Market]
	if b == nil {
		b = &Book{map[uint64]uint64{}, map[uint64]uint64{}}
		bs[d.Market] = b
	}
	side := b.Asks
	if d.Side == perpv1.Side_SIDE_BUY {
		side = b.Bids
	}
	if d.Size == 0 {
		delete(side, d.Price)
	} else {
		side[d.Price] = d.Size
	}
	return b
}

// Best returns top bid/ask, 0 if empty.
// shortcut: O(levels) scan, sorted tree if books get deep.
func (b *Book) Best() (bid, ask uint64) {
	for px := range b.Bids {
		bid = max(bid, px)
	}
	for px := range b.Asks {
		if ask == 0 || px < ask {
			ask = px
		}
	}
	return bid, ask
}

// Level is one price level.
type Level struct{ Price, Size uint64 }

// Levels returns up to depth levels per side, best first (depth <= 0 = all).
func (b *Book) Levels(depth int) (bids, asks []Level) {
	return sorted(b.Bids, depth, true), sorted(b.Asks, depth, false)
}

func sorted(m map[uint64]uint64, depth int, desc bool) []Level {
	out := make([]Level, 0, len(m))
	for p, s := range m {
		out = append(out, Level{p, s})
	}
	slices.SortFunc(out, func(a, b Level) int {
		if desc {
			return cmp.Compare(b.Price, a.Price)
		}
		return cmp.Compare(a.Price, b.Price)
	})
	if depth > 0 && len(out) > depth {
		out = out[:depth]
	}
	return out
}
