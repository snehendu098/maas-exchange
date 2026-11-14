// Package liquidation scans accounts and liquidates those below maintenance.
package liquidation

import "math/big"

// Position mirrors a positions row. Size base 1e8 signed, notional USDC 1e6.
type Position struct {
	Market        uint32
	Size          *big.Int
	EntryNotional *big.Int
	FundingIndex  *big.Int
}

// Account is one trader's collateral plus open positions.
type Account struct {
	Addr       string
	Collateral *big.Int
	Positions  []Position
}

// Market mirrors a markets row (risk params only).
type Market struct {
	MMRBps       int64
	FundingIndex *big.Int
}

var (
	sizeScale    = big.NewInt(1e8)
	bpsScale     = big.NewInt(1e4)
	fundingScale = new(big.Int).Exp(big.NewInt(10), big.NewInt(26), nil) // rate 1e18 * size 1e8
)

// Notional = floor(price*|size|/1e8).
func Notional(price int64, size *big.Int) *big.Int {
	n := new(big.Int).Abs(size)
	n.Mul(n, big.NewInt(price))
	return n.Quo(n, sizeScale)
}

// MM = ceil(Notional*mmrBps/1e4). Engine formula (floor first) is truth.
func MM(price int64, size *big.Int, mmrBps int64) *big.Int {
	n := Notional(price, size)
	return ceilDiv(n.Mul(n, big.NewInt(mmrBps)), bpsScale)
}

// UPnL: long = notional-entry; short = entry-notional.
func UPnL(p Position, notional *big.Int) *big.Int {
	if p.Size.Sign() < 0 {
		return new(big.Int).Sub(p.EntryNotional, notional)
	}
	return new(big.Int).Sub(notional, p.EntryNotional)
}

// Health returns equity and total MM. ok=false if a price or market is missing.
func Health(a Account, prices map[uint32]int64, mkts map[uint32]Market) (equity, mm *big.Int, ok bool) {
	equity, mm = new(big.Int).Set(a.Collateral), new(big.Int)
	for _, p := range a.Positions {
		px, okP := prices[p.Market]
		m, okM := mkts[p.Market]
		if !okP || !okM || px <= 0 {
			return nil, nil, false
		}
		n := Notional(px, p.Size)
		equity.Add(equity, UPnL(p, n))
		equity.Sub(equity, fundingOwed(p, m))
		mm.Add(mm, MM(px, p.Size, m.MMRBps))
	}
	return equity, mm, true
}

// Liquidatable reports equity < MM. Accounts with no positions never are.
func Liquidatable(a Account, prices map[uint32]int64, mkts map[uint32]Market) bool {
	if len(a.Positions) == 0 {
		return false
	}
	eq, mm, ok := Health(a, prices, mkts)
	return ok && eq.Cmp(mm) < 0
}

// fundingOwed = ceil(size*(marketIdx-posIdx)/1e26), as exchange funding.
// Negative = receives.
func fundingOwed(p Position, m Market) *big.Int {
	if m.FundingIndex == nil || p.FundingIndex == nil {
		return new(big.Int)
	}
	d := new(big.Int).Sub(m.FundingIndex, p.FundingIndex)
	return ceilDiv(d.Mul(d, p.Size), fundingScale)
}

// ceilDiv rounds a/b up (b > 0).
func ceilDiv(a, b *big.Int) *big.Int {
	q, r := new(big.Int).QuoRem(a, b, new(big.Int))
	if r.Sign() > 0 {
		q.Add(q, big.NewInt(1))
	}
	return q
}
