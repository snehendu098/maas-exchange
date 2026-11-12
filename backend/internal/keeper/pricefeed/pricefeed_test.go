package pricefeed

import (
	"context"
	"testing"
	"time"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/platform/oracle"
)

func TestTWAP(t *testing.T) {
	t0 := time.Unix(1000, 0)
	w := &TWAP{Window: 10 * time.Second}
	if _, ok := w.Value(t0); ok {
		t.Fatal("empty twap ok")
	}
	w.Add(t0, 100)
	if v, _ := w.Value(t0); v != 100 {
		t.Fatalf("single sample at now = %d", v)
	}
	w.Add(t0.Add(5*time.Second), 200)
	w.Add(t0.Add(2*time.Second), 999) // out of order, dropped
	// [t0, t0+10]: 100 for 5s, 200 for 5s
	if v, _ := w.Value(t0.Add(10 * time.Second)); v != 150 {
		t.Fatalf("got %d want 150", v)
	}
	// [t0+4, t0+14]: 100 for 1s, 200 for 9s = 190
	if v, _ := w.Value(t0.Add(14 * time.Second)); v != 190 {
		t.Fatalf("got %d want 190", v)
	}
	// [t0+6, t0+16]: no sample inside -> stale
	if _, ok := w.Value(t0.Add(16 * time.Second)); ok {
		t.Fatal("stale twap ok")
	}
	// Add trims samples older than the window
	w = &TWAP{Window: 10 * time.Second}
	for _, s := range []int{0, 20, 40} { // start=30: keep 20 (head) + 40
		w.Add(t0.Add(time.Duration(s)*time.Second), 1)
	}
	if len(w.pts) != 2 {
		t.Fatalf("not trimmed: %d pts", len(w.pts))
	}
}

type fixedSrc oracle.Snapshot

func (s fixedSrc) Latest(context.Context) (oracle.Snapshot, error) { return oracle.Snapshot(s), nil }

func TestMarksFallback(t *testing.T) {
	f := &Feed{Src: fixedSrc{Prices: map[uint32]int64{0: 60000e6}, PublishTime: time.Now()}}
	if err := f.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	m := &Marks{Window: time.Minute, Index: f.Index}
	now := time.Now()
	if v, _ := m.Mark(0, now); v != 60000e6 {
		t.Fatalf("fallback got %d", v)
	}
	d := func(buy bool, px, sz uint64) {
		side := perpv1.Side_SIDE_SELL
		if buy {
			side = perpv1.Side_SIDE_BUY
		}
		m.OnBook(&perpv1.BookDelta{Market: 0, Side: side, Price: px, Size: sz}, now.Add(-time.Second))
	}
	expect := func(want int64) {
		t.Helper()
		if v, _ := m.Mark(0, now); v != want {
			t.Fatalf("mark got %d want %d", v, want)
		}
	}
	d(true, 61000e6, 5) // one-sided => index
	expect(60000e6)
	d(false, 61002e6, 3)
	expect(61001e6)
	d(true, 61001e6, 1) // better bid
	d(true, 61001e6, 4) // replace level, same price
	expect(61001500000)
	d(true, 61001e6, 0) // removed => back to 61000
	expect(61001e6)
	d(false, 61002e6, 0) // asks gone => index
	expect(60000e6)
	if _, ok := m.Mark(1, now); ok {
		t.Fatal("no index for market 1")
	}
}

func TestFeedStale(t *testing.T) {
	f := &Feed{Src: fixedSrc{Prices: map[uint32]int64{0: 1}, PublishTime: time.Now().Add(-2 * MaxAge)}}
	if err := f.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := f.Index(0); ok {
		t.Fatal("stale index ok")
	}
}
