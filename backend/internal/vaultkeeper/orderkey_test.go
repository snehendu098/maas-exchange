package vaultkeeper

import (
	"testing"
	"time"
)

func TestOrderKeyDeterministic(t *testing.T) {
	o := Order{Market: 1, Buy: true, ReduceOnly: true, Size: 1e8, Price: 3_517_500_000}
	n1, e1 := OrderKey("vault.testnet", o, -1e8, 0, t0, 2*time.Minute)
	n2, e2 := OrderKey("vault.testnet", o, -1e8, 0, t0.Add(30*time.Second), 2*time.Minute)
	if n1 != n2 || e1 != e2 || n1 == 0 {
		t.Fatal("same intent in same bucket must give same nonce/expiry")
	}
	if e1 <= uint64(t0.UnixMilli()) || e1 > uint64(t0.Add(4*time.Minute).UnixMilli()) {
		t.Fatal("expiry in (now, now+2ttl]", e1)
	}
	for _, c := range []struct {
		name    string
		o       Order
		from    int64
		attempt int
	}{
		{"attempt", o, -1e8, 1},
		{"from", o, -2e8, 0},
		{"size", Order{1, true, true, 2e8, o.Price, 0, 0}, -1e8, 0},
		{"side", Order{1, false, false, 1e8, o.Price, 0, 0}, -1e8, 0},
	} {
		if n, _ := OrderKey("vault.testnet", c.o, c.from, c.attempt, t0, 2*time.Minute); n == n1 {
			t.Errorf("%s change must change nonce", c.name)
		}
	}
}

func TestLimit(t *testing.T) {
	if got := Limit(100_000e6, 100_000, 50, true); got != 100_500e6 {
		t.Fatal(got)
	}
	if got := Limit(40_123_456, 1000, 50, false); got != 39_922_000 || got%1000 != 0 {
		t.Fatal(got)
	}
	if got := Limit(40_123_456, 1000, 50, true); got != 40_325_000 { // 40324073.28 ceil to tick
		t.Fatal(got)
	}
}
