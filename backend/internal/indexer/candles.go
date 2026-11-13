package indexer

import "time"

// Intervals are the candle widths built from fills.
var Intervals = map[string]time.Duration{"1m": time.Minute, "5m": 5 * time.Minute, "1h": time.Hour}

type fillTime struct {
	market uint32
	t      time.Time
}

type bucket struct {
	market   uint32
	interval string
	start    time.Time
}

// buckets maps fill times to the distinct candle buckets they touch.
func buckets(fills []fillTime) map[bucket]bool {
	out := map[bucket]bool{}
	for iv, w := range Intervals {
		for _, f := range fills {
			out[bucket{f.market, iv, f.t.UTC().Truncate(w)}] = true
		}
	}
	return out
}
