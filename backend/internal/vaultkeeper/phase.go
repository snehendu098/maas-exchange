package vaultkeeper

import "maas/backend/internal/vaultkeeper/sizing"

// Phase is where a market's legs sit relative to its target.
type Phase uint8

const (
	Flat Phase = iota
	Hedged
	EnterBuySpot
	EnterOpenShort
	ExitCloseShort
	ExitSellSpot
)

var phaseNames = [...]string{"FLAT", "HEDGED", "ENTER_BUY_SPOT", "ENTER_OPEN_SHORT", "EXIT_CLOSE_SHORT", "EXIT_SELL_SPOT"}

func (p Phase) String() string { return phaseNames[p] }

// Rest: nothing to do.
func (p Phase) Rest() bool { return p == Flat || p == Hedged }

// Unhedged: holding spot without its short (the only exposure legs may leave).
func (p Phase) Unhedged() bool { return p == EnterOpenShort || p == ExitSellSpot }

// LegKind is one executable leg.
type LegKind uint8

const (
	LegNone       LegKind = iota
	LegCloseShort         // perp buy, reduce-only
	LegOpenShort          // perp sell
	LegBuySpot
	LegSellSpot
)

func (k LegKind) String() string {
	return [...]string{"none", "close_short", "open_short", "buy_spot", "sell_spot"}[k]
}

// Leg is a kind plus base 1e8 size.
type Leg struct {
	Kind LegKind
	Size int64
}

func (l Leg) Perp() bool { return l.Kind == LegCloseShort || l.Kind == LegOpenShort }

// View is what Derive needs; Short is the short magnitude (negative = long).
type View struct {
	Spot, Short, Target, Lot, Tol int64
}

// Derive picks the next leg. Short never exceeds spot: exit closes short first, enter buys spot first.
func Derive(v View) (Phase, Leg) {
	hedge := sizing.FloorTo(v.Spot, v.Lot)
	switch {
	case v.Short > v.Spot:
		return ExitCloseShort, Leg{LegCloseShort, v.Short - sizing.FloorTo(min(v.Spot, v.Target), v.Lot)}
	case v.Short > v.Target+v.Tol:
		return ExitCloseShort, Leg{LegCloseShort, v.Short - v.Target}
	case v.Spot > v.Target+v.Tol:
		return ExitSellSpot, Leg{LegSellSpot, v.Spot - max(v.Target, v.Short)}
	case v.Spot < v.Target-v.Tol:
		return EnterBuySpot, Leg{LegBuySpot, v.Target - v.Spot}
	case hedge-v.Short > v.Tol:
		return EnterOpenShort, Leg{LegOpenShort, hedge - v.Short}
	case v.Target == 0 && v.Short == 0:
		return Flat, Leg{}
	}
	return Hedged, Leg{}
}
