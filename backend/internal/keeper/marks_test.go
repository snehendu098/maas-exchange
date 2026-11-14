package keeper

import (
	"testing"

	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
)

func TestMarkUpdates(t *testing.T) {
	ups := markUpdates(map[uint32]int64{1: 3000e6, 2: 0})
	if len(ups) != 1 {
		t.Fatalf("got %d updates, want 1 (zero price skipped)", len(ups))
	}
	b, _ := proto.Marshal(ups[0])
	var got perpv1.ChainUpdate
	if err := proto.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if m := got.GetMark(); m.GetMarket() != 1 || m.GetPrice() != 3000e6 {
		t.Fatalf("mark %v", m)
	}
}
