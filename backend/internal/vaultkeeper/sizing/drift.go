package sizing

// Tolerance is max(lot, size*tolBps), the band inside which legs count as matched.
func Tolerance(size, tolBps, lot int64) int64 {
	return max(lot, MulDiv(size, tolBps, Bps, false))
}

// Drifted reports |spot - short| beyond Tolerance(spot).
func Drifted(spot, short, tolBps, lot int64) bool {
	d := spot - short
	if d < 0 {
		d = -d
	}
	return d > Tolerance(spot, tolBps, lot)
}
