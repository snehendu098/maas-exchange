package keeper

import (
	"encoding/json"
	"testing"
	"time"

	"maas/backend/internal/platform/oracle"
)

func TestPricesArg(t *testing.T) {
	t0 := time.UnixMilli(1730000000123)
	s := oracle.Snapshot{Prices: map[uint32]int64{2: 3e6, 0: 60000e6, 1: 0}, Published: map[uint32]time.Time{0: t0, 2: t0}}
	b, _ := json.Marshal(pricesArg(s))
	if string(b) != `[[0,"60000000000",1730000000123],[2,"3000000",1730000000123]]` {
		t.Fatalf("%s", b)
	}
}
