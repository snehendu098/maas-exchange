package liquidation

import (
	"context"
	"math/big"
	"testing"

	"maas/backend/internal/platform/oracle"
)

var mkts = map[uint32]Market{0: {MMRBps: 250}, 1: {MMRBps: 250}, 2: {MMRBps: 500}, 3: {MMRBps: 500}}

func b(v int64) *big.Int { return big.NewInt(v) }

func pos(m uint32, size, entry int64) Position {
	return Position{Market: m, Size: b(size), EntryNotional: b(entry), FundingIndex: b(0)}
}

// engine parity numbers
func TestHealthParity(t *testing.T) {
	for _, c := range []struct {
		name       string
		a          Account
		mark       int64
		mm, equity int64
	}{
		{"btc long", Account{Collateral: b(10000e6), Positions: []Position{pos(0, 1e8, 60000e6)}}, 61500e6, 1537500000, 11500000000},
		{"btc short", Account{Collateral: b(5000e6), Positions: []Position{pos(0, -50000000, 30000e6)}}, 62000100000, 775001250, 3999950000},
	} {
		eq, mm, ok := Health(c.a, map[uint32]int64{0: c.mark}, mkts)
		if !ok || mm.Int64() != c.mm || eq.Int64() != c.equity {
			t.Errorf("%s: eq %v mm %v ok %v", c.name, eq, mm, ok)
		}
	}
}

func TestMM(t *testing.T) {
	for _, c := range []struct{ price, size, bps, want int64 }{
		{3500123456, 250000007, 250, 218757723},
		{81, 5e7, 250, 1}, // floor first: 40 -> 1; one-step ceil(40.5*bps) would be 2
		{1, 1, 250, 0},    // notional floors to 0
	} {
		if got := MM(c.price, b(c.size), c.bps); got.Int64() != c.want {
			t.Errorf("MM(%d,%d,%d)=%v want %d", c.price, c.size, c.bps, got, c.want)
		}
	}
}

func TestFundingOwed(t *testing.T) {
	m := Market{MMRBps: 250, FundingIndex: new(big.Int).Mul(b(3e6), b(1e18))} // +3 USDC per base
	long := Position{Size: b(2e8), FundingIndex: b(0)}
	short := Position{Size: b(-2e8), FundingIndex: b(0)}
	if got := fundingOwed(long, m); got.Int64() != 6e6 {
		t.Fatalf("long owes %v", got)
	}
	if got := fundingOwed(short, m); got.Int64() != -6e6 {
		t.Fatalf("short owes %v", got)
	}
	// rounding against trader: tiny delta -> long pays 1, short receives 0
	m.FundingIndex = b(1)
	if fundingOwed(long, m).Int64() != 1 || fundingOwed(short, m).Int64() != 0 {
		t.Fatal("rounding not ceil")
	}
}

func TestLiquidatableCross(t *testing.T) {
	// BTC long loses, ETH long gains: cross margin keeps it alive
	a := Account{Collateral: b(5000e6), Positions: []Position{pos(0, 1e8, 60000e6), pos(1, 10e8, 30000e6)}}
	prices := map[uint32]int64{0: 59000e6, 1: 3100e6}
	if Liquidatable(a, prices, mkts) {
		t.Fatal("cross healthy flagged")
	}
	prices[1] = 2600e6 // eq 5000-1000-4000 = 0 < mm
	if !Liquidatable(a, prices, mkts) {
		t.Fatal("underwater not flagged")
	}
	delete(prices, 1)
	if Liquidatable(a, prices, mkts) {
		t.Fatal("missing price must not liquidate")
	}
}

type fakeStore []Account

func (s fakeStore) Accounts(context.Context) ([]Account, error)        { return s, nil }
func (s fakeStore) Markets(context.Context) (map[uint32]Market, error) { return mkts, nil }

type fakeChain struct {
	healthy map[string]bool
	onchain map[string][]Position
	sent    []string
}

func (c *fakeChain) Positions(_ context.Context, a string, _ []uint32) ([]Position, error) {
	return c.onchain[a], nil
}

func (c *fakeChain) Liquidatable(_ context.Context, a string) (bool, error) {
	return !c.healthy[a], nil
}

func (c *fakeChain) Liquidate(_ context.Context, a string, m uint32) error {
	c.sent = append(c.sent, a+":"+string(rune('0'+m)))
	return nil
}

func TestScan(t *testing.T) {
	bad := []Position{pos(0, 1e8, 60000e6), pos(1, 100e8, 300000e6)}
	store := fakeStore{
		{Addr: "ok", Collateral: b(10000e6), Positions: []Position{pos(0, 1e8, 60000e6)}},
		{Addr: "bad", Collateral: b(100e6), Positions: bad},
		{Addr: "drift", Collateral: b(100e6), Positions: bad},
		{Addr: "ins", Collateral: b(100e6), Positions: bad},
	}
	chain := &fakeChain{healthy: map[string]bool{"drift": true}, onchain: map[string][]Position{"bad": bad}}
	s := &Scanner{Store: store, Chain: chain, Insurance: "ins", Prices: func() oracle.Snapshot {
		return oracle.Snapshot{Prices: map[uint32]int64{0: 59000e6, 1: 2900e6}}
	}}
	n, err := s.Scan(context.Background())
	if err != nil || n != 1 || len(chain.sent) != 1 || chain.sent[0] != "bad:1" {
		t.Fatalf("n %d err %v sent %v", n, err, chain.sent)
	}
}

func TestScanLaggingDB(t *testing.T) {
	// db still shows market 0 open (worst + biggest MM there); chain already closed it
	bad := []Position{pos(0, 10e8, 600000e6), pos(1, 100e8, 300000e6)}
	chain := &fakeChain{onchain: map[string][]Position{
		"a": {pos(0, 0, 0), pos(1, 100e8, 300000e6)},
		"b": {pos(0, 0, 0), pos(1, 0, 0)},
	}}
	s := &Scanner{Store: fakeStore{{Addr: "a", Collateral: b(100e6), Positions: bad}, {Addr: "b", Collateral: b(100e6), Positions: bad}},
		Chain: chain, Prices: func() oracle.Snapshot {
			return oracle.Snapshot{Prices: map[uint32]int64{0: 50000e6, 1: 2900e6}} // market 0 worst in db
		}}
	if n, _ := s.Scan(context.Background()); n != 1 || chain.sent[0] != "a:1" {
		t.Fatalf("n %d sent %v", n, chain.sent)
	}
}

func TestPick(t *testing.T) {
	prices := map[uint32]int64{0: 59000e6, 2: 100e6}
	// losing BTC vs break-even ZEC with bigger MM -> BTC
	if m, ok := pick([]Position{pos(2, 1000e8, 100000e6), pos(0, 1e8, 60000e6)}, prices, mkts); !ok || m != 0 {
		t.Fatalf("picked %d %v", m, ok)
	}
	// no losers -> biggest MM
	if m, ok := pick([]Position{pos(0, 1e8, 50000e6), pos(2, 1000e8, 100000e6)}, prices, mkts); !ok || m != 2 {
		t.Fatalf("picked %d %v", m, ok)
	}
	if _, ok := pick([]Position{pos(0, 0, 0)}, prices, mkts); ok {
		t.Fatal("size 0 picked")
	}
}
