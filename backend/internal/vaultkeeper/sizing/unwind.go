package sizing

// Leg is one hedged market as the unwinder sees it.
type Leg struct {
	Size, Price, Lot int64
}

// Value is USDC a leg frees when fully unwound: spot notional + its margin.
func Value(l Leg, levBps int64) int64 {
	n := Notional(l.Size, l.Price, false)
	return n + MulDiv(n, Bps, levBps, false)
}

// ProRata sizes to unwind per market to free shortfall USDC; ceil to lot, capped at leg size.
func ProRata(shortfall, levBps int64, legs map[uint32]Leg) map[uint32]int64 {
	var total int64
	for _, l := range legs {
		total += Value(l, levBps)
	}
	out := make(map[uint32]int64, len(legs))
	for id, l := range legs {
		if shortfall >= total {
			out[id] = l.Size
			continue
		}
		out[id] = min(l.Size, CeilTo(MulDiv(l.Size, shortfall, total, true), l.Lot))
	}
	return out
}
