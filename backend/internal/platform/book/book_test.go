package book

import (
	"testing"

	perpv1 "maas/backend/gen/perp/v1"
)

func TestApply(t *testing.T) {
	bs := Books{}
	for _, d := range []*perpv1.BookDelta{
		{Side: perpv1.Side_SIDE_BUY, Price: 10, Size: 1},
		{Side: perpv1.Side_SIDE_BUY, Price: 12, Size: 2},
		{Side: perpv1.Side_SIDE_SELL, Price: 15, Size: 3},
		{Side: perpv1.Side_SIDE_SELL, Price: 14, Size: 4},
		{Side: perpv1.Side_SIDE_SELL, Price: 14, Size: 0},
	} {
		bs.Apply(d)
	}
	b := bs[0]
	if bid, ask := b.Best(); bid != 12 || ask != 15 {
		t.Fatalf("best %d %d", bid, ask)
	}
	bids, asks := b.Levels(1)
	if len(bids) != 1 || bids[0] != (Level{12, 2}) || len(asks) != 1 || asks[0] != (Level{15, 3}) {
		t.Fatalf("levels %v %v", bids, asks)
	}
}
