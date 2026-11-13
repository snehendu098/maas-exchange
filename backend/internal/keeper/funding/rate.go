// Package funding posts per-market funding rates each interval.
package funding

import "math/big"

// Scale is the rate fixed-point scale (1e18 = 100%).
var Scale = big.NewInt(1e18)

// Rate = clamp(((mark-index)/index + interest/day)/periodsPerDay, ±cap), scaled by Scale.
// interestBpsDay: base rate longs pay shorts. Truncates toward zero so longs and shorts round alike.
func Rate(mark, index, periodsPerDay, interestBpsDay int64, cap *big.Int) *big.Int {
	r := big.NewInt(mark - index)
	r.Mul(r, Scale)
	r.Quo(r, big.NewInt(index))
	r.Add(r, big.NewInt(interestBpsDay*1e14)) // 1 bp = 1e14 in Scale
	r.Quo(r, big.NewInt(periodsPerDay))
	return clamp(r, cap)
}

func clamp(r, cap *big.Int) *big.Int {
	if r.Cmp(cap) > 0 {
		return new(big.Int).Set(cap)
	}
	if neg := new(big.Int).Neg(cap); r.Cmp(neg) < 0 {
		return neg
	}
	return r
}
