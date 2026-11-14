package funding

import (
	"context"
	"math/big"
	"testing"
	"time"
)

func TestRate(t *testing.T) {
	cap := big.NewInt(1e15) // 0.1%
	for _, c := range []struct {
		name             string
		mark, index, ppd int64
		bps, want        int64
	}{
		{"premium 1% hourly", 60600e6, 60000e6, 24, 0, 416666666666666},
		{"discount 1% hourly", 59400e6, 60000e6, 24, 0, -416666666666666},
		{"flat", 60000e6, 60000e6, 24, 0, 0},
		{"flat + 3bps/day hourly", 60000e6, 60000e6, 24, 3, 12500000000000},
		{"flat + 3bps/day 8h = 0.01%", 60000e6, 60000e6, 3, 3, 1e14},
		{"premium + interest", 60600e6, 60000e6, 24, 3, 429166666666666},
		{"discount offsets interest", 59998e6, 60000e6, 24, 3, 11111111111111},
		{"clamp up", 66000e6, 60000e6, 1, 3, 1e15},
		{"clamp down", 54000e6, 60000e6, 1, 3, -1e15},
	} {
		if got := Rate(c.mark, c.index, c.ppd, c.bps, cap); got.Int64() != c.want {
			t.Errorf("%s: got %s want %d", c.name, got, c.want)
		}
	}
}

type recPoster map[uint32]*big.Int

func (p recPoster) UpdateFunding(_ context.Context, m uint32, r *big.Int) error {
	p[m] = r
	return nil
}

func TestNextBoundary(t *testing.T) {
	now := time.Date(2026, 1, 1, 10, 59, 59, 0, time.UTC)
	if got := NextBoundary(now, time.Hour); !got.Equal(time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC)) {
		t.Fatalf("got %v", got)
	}
	if got := NextBoundary(now.Add(time.Second), time.Hour); !got.Equal(time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("on boundary: got %v", got)
	}
}

func TestTick(t *testing.T) {
	p := recPoster{}
	f := &Funder{
		Markets:  []uint32{0, 1},
		Interval: time.Hour,
		Cap:      big.NewInt(1e15),
		Mark:     func(m uint32, _ time.Time) (int64, bool) { return 60600e6, true },
		Index:    func(m uint32) (int64, bool) { return 60000e6, m == 0 },
		Poster:   p,
	}
	f.Tick(context.Background())
	if len(p) != 1 || p[0].Int64() != 416666666666666 {
		t.Fatalf("posted %v", p)
	}
	if f.Rates()[0].Int64() != 416666666666666 {
		t.Fatalf("rates %v", f.Rates())
	}
}
