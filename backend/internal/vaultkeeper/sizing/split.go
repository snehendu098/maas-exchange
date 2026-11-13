package sizing

// Split cuts capital into spot and margin so margin*lev = spot notional. Spot floors, margin gets the dust.
func Split(capital, levBps int64) (spot, margin int64) {
	spot = MulDiv(capital, levBps, levBps+Bps, false)
	return spot, capital - spot
}

// SizeFor is base units buyable with usdc at price, floored to lot.
func SizeFor(usdc, price, lot int64) int64 {
	return FloorTo(MulDiv(usdc, One, price, false), lot)
}

// Notional is USDC value of size at price.
func Notional(size, price int64, up bool) int64 {
	return MulDiv(size, price, One, up)
}

// Margin is perp collateral needed for short notional at levBps, ceil.
func Margin(notional, levBps int64) int64 {
	return MulDiv(notional, Bps, levBps, true)
}
