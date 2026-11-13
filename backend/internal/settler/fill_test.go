package settler

import (
	"encoding/json"
	"errors"
	"slices"
	"testing"

	perpv1 "maas/backend/gen/perp/v1"
)

func TestToFill(t *testing.T) {
	mk := &perpv1.Order{Trader: "maker.testnet", Market: 2, Side: perpv1.Side_SIDE_SELL, Price: 40e6, Size: 3e8, Nonce: 7, ExpiryMs: 99,
		Signature: make([]byte, 64), PublicKey: "ed25519:11111111111111111111111111111111"}
	tk := &perpv1.Order{Trader: "taker.testnet", Market: 2, Side: perpv1.Side_SIDE_BUY, Price: 41e6, Size: 1e8, ReduceOnly: true,
		Signature: []byte{1}, PublicKey: "ed25519:11111111111111111111111111111111"}
	f := toFill(&perpv1.Fill{Market: 2, TradeId: 5, Price: 40e6, Size: 1e8}, mk, tk)
	if f.Maker.Trader != "maker.testnet" || f.Maker.MarketID != 2 || f.Maker.IsBuy || f.Maker.Price != 40e6 ||
		f.Maker.Size != 3e8 || f.Maker.Nonce != 7 || f.Maker.ExpiryMs != 99 || f.Maker.ReduceOnly {
		t.Fatalf("maker %+v", f.Maker)
	}
	if !f.Taker.IsBuy || !f.Taker.ReduceOnly || f.Taker.Price != 41e6 || f.TakerSig != "AQ==" {
		t.Fatalf("taker %+v", f)
	}
	b, _ := json.Marshal(f)
	var m map[string]any
	json.Unmarshal(b, &m)
	if m["price"] != "40000000" || m["size"] != "100000000" || m["maker_key"] != "ed25519:11111111111111111111111111111111" {
		t.Fatalf("json %s", b)
	}
}

func TestBisect(t *testing.T) {
	var sent [][]int
	try := func(xs []int) (bool, error) {
		sent = append(sent, xs)
		return !slices.Contains(xs, 3) && !slices.Contains(xs, 6), nil
	}
	bad, err := bisect([]int{1, 2, 3, 4, 5, 6, 7, 8}, try)
	if err != nil || !slices.Equal(bad, []int{3, 6}) {
		t.Fatalf("bad %v err %v", bad, err)
	}
	var ok []int
	for _, xs := range sent {
		if !slices.Contains(xs, 3) && !slices.Contains(xs, 6) {
			ok = append(ok, xs...)
		}
	}
	if slices.Sort(ok); !slices.Equal(ok, []int{1, 2, 4, 5, 7, 8}) {
		t.Fatalf("each good fill must land exactly once: %v", ok)
	}
	boom := errors.New("rpc down")
	if _, err := bisect([]int{1, 3}, func([]int) (bool, error) { return false, boom }); err != boom {
		t.Fatalf("transport err %v", err)
	}
}

func TestFresh(t *testing.T) {
	f := func(m uint32, id uint64) *perpv1.Fill { return &perpv1.Fill{Market: m, TradeId: id} }
	in := []*perpv1.Fill{f(0, 1), f(0, 2), f(1, 1), f(0, 2), f(0, 3)}
	out := fresh(in, map[ref]bool{{0, 1}: true})
	var got []ref
	for _, x := range out {
		got = append(got, refOf(x))
	}
	if !slices.Equal(got, []ref{{0, 2}, {1, 1}, {0, 3}}) {
		t.Fatalf("fresh %v", got)
	}
}
