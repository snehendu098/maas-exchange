package vaultkeeper

import "testing"

const lot = 10_000 // BTC lot, base 1e8

func TestDerive(t *testing.T) {
	cases := []struct {
		name  string
		v     View
		phase Phase
		leg   Leg
	}{
		{"flat", View{0, 0, 0, lot, 0}, Flat, Leg{}},
		{"hedged", View{1e8, 1e8, 1e8, lot, lot}, Hedged, Leg{}},
		{"hedged inside band", View{1e8 + 5_000, 1e8, 1e8, lot, lot}, Hedged, Leg{}},
		{"enter buys spot first", View{0, 0, 1e8, lot, lot}, EnterBuySpot, Leg{LegBuySpot, 1e8}},
		{"enter then shorts spot held", View{99_995_000, 0, 1e8, lot, lot}, EnterOpenShort, Leg{LegOpenShort, 99_990_000}},
		{"exit closes short first", View{1e8, 1e8, 0, lot, 0}, ExitCloseShort, Leg{LegCloseShort, 1e8}},
		{"exit then sells spot", View{1e8, 0, 0, lot, 0}, ExitSellSpot, Leg{LegSellSpot, 1e8}},
		{"over-short trims short to spot", View{5e7, 1e8, 1e8, lot, lot}, ExitCloseShort, Leg{LegCloseShort, 5e7}},
		{"drift: spot > short trims by shorting", View{1e8, 5e7, 1e8, lot, lot}, EnterOpenShort, Leg{LegOpenShort, 5e7}},
		{"unwind closes short to target", View{1e8, 1e8, 9e7, lot, 0}, ExitCloseShort, Leg{LegCloseShort, 1e7}},
		{"unwind sells spot to target", View{1e8, 9e7, 9e7, lot, 0}, ExitSellSpot, Leg{LegSellSpot, 1e7}},
		{"sell never below short", View{1e8, 95_000_000, 9e7, lot, 5_000_000}, ExitSellSpot, Leg{LegSellSpot, 5_000_000}},
		{"long position gets sold to hedge", View{1e8, -lot, 1e8, lot, lot}, EnterOpenShort, Leg{LegOpenShort, 1e8 + lot}},
		{"flat with dust", View{lot - 1, 0, 0, lot, lot}, Flat, Leg{}},
	}
	for _, c := range cases {
		p, l := Derive(c.v)
		if p != c.phase || l != c.leg {
			t.Errorf("%s: got %s %+v want %s %+v", c.name, p, l, c.phase, c.leg)
		}
		if l.Kind == LegOpenShort && c.v.Short+l.Size > c.v.Spot {
			t.Errorf("%s: open short would exceed spot", c.name)
		}
		if l.Kind == LegSellSpot && c.v.Spot-l.Size < c.v.Short {
			t.Errorf("%s: sell would leave naked short", c.name)
		}
	}
}
