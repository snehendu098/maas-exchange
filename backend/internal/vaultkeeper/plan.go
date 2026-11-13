package vaultkeeper

import "maas/backend/internal/vaultkeeper/sizing"

// plan sets sticky targets at rest: pro-rata unwind for a queue shortfall, else weight targets.
func (k *Keeper) plan(s snap) {
	if short := s.Pending() - s.Idle; short > 0 {
		k.unwind(s, short)
		return
	}
	k.allocate(s)
}

// unwind cuts every short pro-rata by value to free short USDC; exact so small cuts still land.
func (k *Keeper) unwind(s snap, short int64) {
	legs := map[uint32]sizing.Leg{}
	for _, id := range k.ids {
		if sz := -s.Pos[id]; sz > 0 && s.Index[id] > 0 {
			legs[id] = sizing.Leg{Size: sz, Price: s.Index[id], Lot: k.specs[id].Lot}
		}
	}
	for id, cut := range sizing.ProRata(short, s.Config.ShortLevBps, legs) {
		if cut > 0 {
			k.ms[id].SetTarget(legs[id].Size-cut, true)
		}
	}
}

// allocate targets each HEDGED market at weight x (NAV - buffer - queue). FLAT shares stay idle.
func (k *Keeper) allocate(s snap) {
	inv := sizing.Deployable(s.NAV, s.NAV, s.Config.IdleBufferBps, s.Pending())
	for _, id := range k.ids {
		idx, w := s.Index[id], s.Config.Weights[id]
		if s.Modes[id] != ModeHedged || idx <= 0 || w <= 0 {
			continue
		}
		spot, _ := sizing.Split(sizing.MulDiv(inv, w, sizing.Bps, false), s.Config.ShortLevBps)
		size := sizing.SizeFor(spot, idx, k.specs[id].Lot)
		cur := max(-s.Pos[id], 0)
		if move := sizing.Notional(abs(size-cur), idx, false); move >= max(k.P.MinMove, 1) {
			k.ms[id].SetTarget(size, false)
		}
	}
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
