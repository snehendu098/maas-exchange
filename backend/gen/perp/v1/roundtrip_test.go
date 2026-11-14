package perpv1_test

import (
	"testing"

	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
)

func TestOrderRoundTrip(t *testing.T) {
	in := &perpv1.Order{
		Trader:     "alice.testnet",
		Market:     0,
		Side:       perpv1.Side_SIDE_BUY,
		Type:       perpv1.OrderType_ORDER_TYPE_LIMIT,
		Tif:        perpv1.TimeInForce_TIME_IN_FORCE_GTC,
		Price:      60_000_000_000,
		Size:       100_000_000,
		Nonce:      7,
		ExpiryMs:   1_900_000_000_000,
		ClientId:   "c-1",
		OrderHash:  make([]byte, 32),
		Signature:  make([]byte, 64),
		PublicKey:  "ed25519:11111111111111111111111111111111",
		ReduceOnly: true,
	}
	raw, err := proto.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	out := &perpv1.Order{}
	if err := proto.Unmarshal(raw, out); err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(in, out) {
		t.Fatalf("mismatch: %v != %v", in, out)
	}
}

func TestEngineOutputOneof(t *testing.T) {
	in := &perpv1.EngineOutput{
		InputSeq: 42,
		Index:    1,
		Event: &perpv1.EngineOutput_Fill{Fill: &perpv1.Fill{
			Market: 1, TradeId: 3, Price: 3_000_000_000, Size: 100_000, TakerSide: perpv1.Side_SIDE_SELL,
		}},
	}
	raw, err := proto.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	out := &perpv1.EngineOutput{}
	if err := proto.Unmarshal(raw, out); err != nil {
		t.Fatal(err)
	}
	if out.GetFill().GetTradeId() != 3 || out.GetInputSeq() != 42 {
		t.Fatalf("bad decode: %v", out)
	}
}
