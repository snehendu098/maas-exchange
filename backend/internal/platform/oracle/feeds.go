// Package oracle fetches Pyth index prices from Hermes.
package oracle

import (
	"math"
	"time"
)

// Snapshot is index prices (USDC 1e6) with per-market publish times.
type Snapshot struct {
	Prices      map[uint32]int64
	Published   map[uint32]time.Time
	PublishTime time.Time // oldest feed's publish time
	Missing     []uint32  // markets the API key is not entitled to (no price)
}

// ToE6 converts Pyth price*10^expo to USDC 1e6, floored. ok=false on overflow.
func ToE6(price int64, expo int32) (int64, bool) {
	e := int(expo) + 6
	for ; e > 0; e-- {
		if price > math.MaxInt64/10 || price < math.MinInt64/10 {
			return 0, false
		}
		price *= 10
	}
	for ; e < 0; e++ {
		price /= 10
	}
	return price, true
}
