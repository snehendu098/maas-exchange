package vaultchain

import (
	"fmt"
	"math/big"
)

// sizeDec is the domain size precision (1e8 per whole base).
const sizeDec = 8

// fromSize converts base 1e8 to token units of dec decimals (floor).
func fromSize(size int64, dec uint8) *big.Int {
	return scale(big.NewInt(size), int(dec)-sizeDec)
}

func scale(n *big.Int, exp int) *big.Int {
	p := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(abs(exp))), nil)
	if exp >= 0 {
		return new(big.Int).Mul(n, p)
	}
	return new(big.Int).Quo(n, p)
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// queuedAssets is the gross USDC a request of shares is owed at nav: ceil(shares*(nav+1)/(supply+1)) + 1.
// +1: per-request roundings summed stay >= the contract's reserve.
func queuedAssets(shares, nav, supply *big.Int) *big.Int {
	n := new(big.Int).Mul(shares, new(big.Int).Add(nav, big.NewInt(1)))
	d := new(big.Int).Add(supply, big.NewInt(1))
	q, r := new(big.Int).QuoRem(n, d, new(big.Int))
	if r.Sign() > 0 {
		q.Add(q, big.NewInt(1))
	}
	return q.Add(q, big.NewInt(1))
}

func i64(n *big.Int) (int64, error) {
	if !n.IsInt64() {
		return 0, fmt.Errorf("vaultchain: %s overflows int64", n)
	}
	return n.Int64(), nil
}
