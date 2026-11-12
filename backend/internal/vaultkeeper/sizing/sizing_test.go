package sizing

import "testing"

func TestMulDiv(t *testing.T) {
	cases := []struct {
		a, b, c int64
		up      bool
		want    int64
	}{
		{10, 3, 4, false, 7}, {10, 3, 4, true, 8}, {12, 3, 4, true, 9},
		{1_000_000e6, One, 100_000e6, false, 10 * One}, // 1M USDC of 100k BTC, a*b > int64
		{0, 5, 1, false, 0}, {-1, 5, 1, false, 0}, {5, 5, 0, false, 0},
		{1 << 62, 1 << 62, 1, false, maxI64},
	}
	for _, c := range cases {
		if got := MulDiv(c.a, c.b, c.c, c.up); got != c.want {
			t.Errorf("MulDiv(%d,%d,%d,%v)=%d want %d", c.a, c.b, c.c, c.up, got, c.want)
		}
	}
}

func TestRound(t *testing.T) {
	if FloorTo(1999, 1000) != 1000 || CeilTo(1001, 1000) != 2000 || CeilTo(1000, 1000) != 1000 || FloorTo(-5, 10) != 0 {
		t.Fatal("rounding")
	}
}

func TestSplit(t *testing.T) {
	s, m := Split(3_000e6, 20_000) // 2x short: 2/3 spot, 1/3 margin
	if s != 2_000e6 || m != 1_000e6 {
		t.Fatalf("2x: %d %d", s, m)
	}
	s, m = Split(1_000_001, 10_000) // 1x: odd unit goes to margin
	if s != 500_000 || m != 500_001 {
		t.Fatalf("1x: %d %d", s, m)
	}
	if Margin(s, 10_000) > m {
		t.Fatal("margin must cover spot notional")
	}
	if Margin(1_000_001, 20_000) != 500_001 {
		t.Fatal("margin ceils")
	}
}

func TestSizeFor(t *testing.T) {
	if got := SizeFor(1_000e6, 100_000e6, 10_000); got != 1_000_000 { // 0.01 BTC
		t.Fatal(got)
	}
	got := SizeFor(1_001e6, 40_123_456, 1_000_000)
	if got%1_000_000 != 0 || Notional(got, 40_123_456, true) > 1_001e6 {
		t.Fatal(got)
	}
}

func TestDeployable(t *testing.T) {
	if got := Deployable(20_000e6, 100_000e6, 500, 2_000e6); got != 13_000e6 { // buffer 5k, pending 2k
		t.Fatal(got)
	}
	if Deployable(4_000e6, 100_000e6, 500, 0) != 0 {
		t.Fatal("below buffer deploys nothing")
	}
}

func TestAllocate(t *testing.T) {
	got := Allocate(9_000e6, map[uint32]int64{0: 4000, 1: 3000, 2: 2000}) // renormalize over 90%
	if got[0] != 4_000e6 || got[1] != 3_000e6 || got[2] != 2_000e6 {
		t.Fatal(got)
	}
	got = Allocate(10, map[uint32]int64{0: 1, 1: 1, 2: 1})
	if got[0]+got[1]+got[2] > 10 || got[0] != 3 {
		t.Fatal("floors, never over-allocates", got)
	}
	if Allocate(10, map[uint32]int64{0: 0})[0] != 0 {
		t.Fatal("zero weights")
	}
}

func TestDrift(t *testing.T) {
	if Drifted(One, One-1_000_000, 100, 10_000) { // 1% of 1 BTC
		t.Fatal("inside tol")
	}
	if !Drifted(One, One-1_000_001, 100, 10_000) || !Drifted(One, One+1_000_001, 100, 10_000) {
		t.Fatal("outside tol")
	}
	if Tolerance(0, 100, 10_000) != 10_000 {
		t.Fatal("lot floor")
	}
}

func TestProRata(t *testing.T) {
	legs := map[uint32]Leg{
		0: {Size: One, Price: 100_000e6, Lot: 10_000},     // 100k notional
		1: {Size: 10 * One, Price: 3_000e6, Lot: 100_000}, // 30k
		2: {Size: 0, Price: 40e6, Lot: 1_000_000},
	}
	got := ProRata(26_000e6, 10_000, legs) // 1x: values 200k + 60k, 26k = 10%
	if got[0] != One/10 || got[1] != One || got[2] != 0 {
		t.Fatal(got)
	}
	got = ProRata(1, 10_000, legs)
	if got[0] != 10_000 || got[1] != 100_000 {
		t.Fatal("ceil to lot", got)
	}
	var freed int64
	for id, s := range ProRata(12_345e6, 10_000, legs) {
		freed += Value(Leg{s, legs[id].Price, legs[id].Lot}, 10_000)
	}
	if freed < 12_345e6 {
		t.Fatal("under-unwound", freed)
	}
	all := ProRata(1_000_000e6, 10_000, legs)
	if all[0] != One || all[1] != 10*One {
		t.Fatal("shortfall > total unwinds all", all)
	}
}
