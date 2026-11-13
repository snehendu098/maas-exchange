package vaultkeeper

import (
	"context"
	"fmt"
	"log/slog"
	"maps"

	"maas/backend/internal/vaultkeeper/sizing"
)

// treasury runs at rest: fulfill queue FIFO from idle, then true up perp margin. acted = state changed.
func (k *Keeper) treasury(ctx context.Context, s *snap) (acted bool, err error) {
	for _, w := range s.Queue {
		if w.Assets > s.Idle {
			break
		}
		if err := k.Vault.Fulfill(ctx, w.ID); err != nil {
			return true, fmt.Errorf("fulfill %d: %w", w.ID, err)
		}
		slog.Info("vaultkeeper: fulfilled", "request", w.ID, "assets", w.Assets)
		s.Idle -= w.Assets
		acted = true
	}
	if acted {
		return true, nil
	}
	need := k.marginNeed(s, s.Pos)
	slack := sizing.MulDiv(need, k.P.TolBps, sizing.Bps, false) + k.P.MinMove
	if s.Pending() > s.Idle {
		slack = 0 // queue waits on this margin
	}
	switch {
	case s.Col > need+slack:
		amt := s.Col - need
		slog.Info("vaultkeeper: withdraw margin", "amount", amt, "collateral", s.Col, "need", need)
		return true, k.Vault.WithdrawMargin(ctx, amt)
	case s.Col+slack < need && s.Idle > s.Pending():
		amt := min(need-s.Col, s.Idle-s.Pending())
		slog.Info("vaultkeeper: top up margin", "amount", amt, "collateral", s.Col, "need", need)
		return true, k.Vault.DepositMargin(ctx, amt)
	}
	return false, nil
}

// ensureMargin deposits so collateral covers every short once market id sits at want.
func (k *Keeper) ensureMargin(ctx context.Context, id uint32, want int64, s *snap) error {
	pos := maps.Clone(s.Pos)
	pos[id] = want
	need := k.marginNeed(s, pos)
	if s.Col >= need {
		return nil
	}
	dep := need - s.Col
	if dep > s.Idle-s.Pending() { // vault reverts Reserved on queue-owed idle
		return fmt.Errorf("margin needs %d USDC, idle %d, queued %d", dep, s.Idle, s.Pending())
	}
	if err := k.Vault.DepositMargin(ctx, dep); err != nil {
		return fmt.Errorf("deposit margin: %w", err)
	}
	s.Col, s.Idle = s.Col+dep, s.Idle-dep
	return nil
}

// marginNeed sums short notional at index / leverage.
func (k *Keeper) marginNeed(s *snap, pos map[uint32]int64) int64 {
	var n int64
	for _, m := range k.ids {
		n += sizing.Notional(-pos[m], s.Index[m], true)
	}
	return sizing.Margin(n, s.Config.ShortLevBps)
}
