package sizing

// Deployable is idle USDC above the buffer (bps of nav) and pending withdrawals.
func Deployable(idle, nav, bufferBps, pending int64) int64 {
	return max(0, idle-MulDiv(nav, bufferBps, Bps, true)-pending)
}

// Allocate splits usdc across markets by weight bps, renormalized over the given set; floors.
func Allocate(usdc int64, weights map[uint32]int64) map[uint32]int64 {
	var sum int64
	for _, w := range weights {
		sum += max(w, 0)
	}
	out := make(map[uint32]int64, len(weights))
	for id, w := range weights {
		if sum > 0 {
			out[id] = MulDiv(usdc, w, sum, false)
		}
	}
	return out
}
