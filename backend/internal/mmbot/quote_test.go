package mmbot

import (
	"math"
	"math/rand/v2"
	"testing"
)

var p = Params{Levels: 3, SpreadBps: 10, StepBps: 10, SkewBps: 20, ReplaceBps: 5, LevelNotional: 1000e6, MaxNotional: 10_000e6}

func TestQuotesFlat(t *testing.T) {
	// BTC 100k, tick 0.1 USDC, lot 1e4
	qs := Quotes(100_000e6, 100_000, 10_000, 0, p, nil)
	want := []Quote{
		{true, 99_900e6, 1_000_000}, {false, 100_100e6, 1_000_000},
		{true, 99_800e6, 1_000_000}, {false, 100_200e6, 1_000_000},
		{true, 99_700e6, 1_000_000}, {false, 100_300e6, 1_000_000},
	}
	if len(qs) != len(want) {
		t.Fatalf("got %v", qs)
	}
	for i := range want {
		if qs[i] != want[i] {
			t.Fatalf("level %d: got %+v want %+v", i, qs[i], want[i])
		}
	}
}

func TestQuotesTickLot(t *testing.T) {
	// HYPE 40.123456, tick 0.001, lot 0.01: bids floor, asks ceil, size floored to lot
	for _, q := range Quotes(40_123_456, 1000, 1_000_000, 0, p, nil) {
		if q.Price%1000 != 0 || q.Size%1_000_000 != 0 || q.Size == 0 {
			t.Fatalf("off grid %+v", q)
		}
		if q.Buy == (q.Price >= 40_123_456) {
			t.Fatalf("wrong side of index %+v", q)
		}
	}
}

func TestSkew(t *testing.T) {
	flat := Quotes(100_000e6, 100_000, 10_000, 0, p, nil)
	long := Quotes(100_000e6, 100_000, 10_000, 5_000_000, p, nil) // 0.05 BTC = 5k = half cap
	if long[0].Price >= flat[0].Price || long[1].Price >= flat[1].Price {
		t.Fatalf("long should shift quotes down: flat %v long %v", flat[:2], long[:2])
	}
	short := Quotes(100_000e6, 100_000, 10_000, -5_000_000, p, nil)
	if short[0].Price <= flat[0].Price || short[1].Price <= flat[1].Price {
		t.Fatalf("short should shift quotes up: %v", short[:2])
	}
	// at cap: only the side that reduces inventory
	for _, q := range Quotes(100_000e6, 100_000, 10_000, 20_000_000, p, nil) {
		if q.Buy {
			t.Fatalf("long at cap still bids %+v", q)
		}
	}
	for _, q := range Quotes(100_000e6, 100_000, 10_000, -20_000_000, p, nil) {
		if !q.Buy {
			t.Fatalf("short at cap still asks %+v", q)
		}
	}
}

func TestStale(t *testing.T) {
	for _, c := range []struct {
		last, now uint64
		want      bool
	}{{0, 100, true}, {100_000, 100_040, false}, {100_000, 100_050, false}, {100_000, 100_051, true}, {100_000, 99_940, true}} {
		if got := Stale(c.last, c.now, 5); got != c.want {
			t.Errorf("Stale(%d,%d)=%v", c.last, c.now, got)
		}
	}
}

func TestQuotesJitter(t *testing.T) {
	// jitter varies sizes, keeps sides of index and grid; spread > 0 so level 1 never crosses
	pj := p
	pj.Jitter = 0.9
	r := rand.New(rand.NewPCG(1, 2))
	sizes := map[uint64]bool{}
	for _, q := range Quotes(100_000e6, 100_000, 10_000, 0, pj, NewShape(pj, r.Float64)) {
		sizes[q.Size] = true
		if q.Price%100_000 != 0 || q.Size%10_000 != 0 || q.Size == 0 || q.Buy == (q.Price >= 100_000e6) {
			t.Fatalf("bad quote %+v", q)
		}
	}
	if len(sizes) < 3 {
		t.Fatalf("sizes not jittered: %v", sizes)
	}
}

func TestShapeMutate(t *testing.T) {
	// churn changes at most Churn levels per side, keeps the rest (so their orders stay)
	pj := p
	pj.Levels, pj.Jitter, pj.Churn = 10, 0.8, 2
	r := rand.New(rand.NewPCG(3, 4))
	sh := NewShape(pj, r.Float64)
	before := Quotes(100_000e6, 100_000, 10_000, 0, pj, sh)
	sh.Mutate(pj, r.Float64)
	after := Quotes(100_000e6, 100_000, 10_000, 0, pj, sh)
	changed := 0
	for i := range before {
		if before[i] != after[i] {
			changed++
		}
	}
	if changed == 0 || changed > 4 {
		t.Fatalf("changed %d quotes, want 1..4", changed)
	}
}

func TestBasisOU(t *testing.T) {
	// 1s steps over 10 tau: bounded by 3σ, sample std near σ, mean near 0
	b, r := Basis{Std: 5, Tau: 60}, rand.New(rand.NewPCG(5, 6))
	var sum, sq float64
	n := 6000
	for range n {
		b.Step(1, r.NormFloat64())
		if math.Abs(b.Bps) > 15 {
			t.Fatalf("unbounded %v", b.Bps)
		}
		sum, sq = sum+b.Bps, sq+b.Bps*b.Bps
	}
	mean := sum / float64(n)
	std := math.Sqrt(sq/float64(n) - mean*mean)
	if math.Abs(mean) > 2 || std < 3 || std > 7 {
		t.Fatalf("mean %.2f std %.2f", mean, std)
	}
}

func TestBasisPositiveMean(t *testing.T) {
	// mean 4, std 4: premium (and so funding) positive most of the time
	b, r := Basis{Bps: 4, Mean: 4, Std: 4, Tau: 60}, rand.New(rand.NewPCG(7, 8))
	pos, n := 0, 6000
	for range n {
		b.Step(1, r.NormFloat64())
		if b.Bps > 0 {
			pos++
		}
	}
	if f := float64(pos) / float64(n); f < 0.75 {
		t.Fatalf("positive only %.0f%% of the time", f*100)
	}
}
