package sizing

import "math/bits"

// Bps is the basis-point denominator.
const Bps = 10_000

// One is one whole base unit in size units (1e8).
const One = 100_000_000

const maxI64 = 1<<63 - 1

// MulDiv = a*b/c over 128 bits, floor or ceil; non-positive input gives 0, overflow saturates.
func MulDiv(a, b, c int64, up bool) int64 {
	if a <= 0 || b <= 0 || c <= 0 {
		return 0
	}
	hi, lo := bits.Mul64(uint64(a), uint64(b))
	if hi >= uint64(c) {
		return maxI64
	}
	q, r := bits.Div64(hi, lo, uint64(c))
	if up && r != 0 {
		q++
	}
	if q > maxI64 {
		return maxI64
	}
	return int64(q)
}

// FloorTo rounds n down to a multiple of step (step <= 0 = no-op).
func FloorTo(n, step int64) int64 {
	if step <= 0 || n <= 0 {
		return max(n, 0)
	}
	return n / step * step
}

// CeilTo rounds n up to a multiple of step.
func CeilTo(n, step int64) int64 {
	if step <= 0 || n <= 0 {
		return max(n, 0)
	}
	return (n + step - 1) / step * step
}
