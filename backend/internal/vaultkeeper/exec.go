package vaultkeeper

import (
	"context"
	"fmt"
	"log/slog"

	"maas/backend/internal/vaultkeeper/sizing"
)

// advance steps one market and executes its leg; s is updated so later markets see spent idle.
func (k *Keeper) advance(ctx context.Context, id uint32, s *snap) error {
	m, spec, now := k.ms[id], k.specs[id], k.Clock.Now()
	d := m.Step(Obs{Mode: s.Modes[id], Spot: s.Spot[id], Position: s.Pos[id], Lot: spec.Lot}, now)
	if d.Phase != d.Prev {
		slog.Info("vaultkeeper: phase", "market", spec.Symbol, "from", d.Prev, "to", d.Phase)
	}
	for _, n := range d.Notes {
		k.alert(ctx, id, n)
	}
	if d.Leg.Kind == LegNone {
		return nil
	}
	slog.Info("vaultkeeper: leg", "market", spec.Symbol, "phase", d.Phase, "kind", d.Leg.Kind, "size", d.Leg.Size, "attempt", d.Attempt)
	err := k.exec(ctx, id, d, s)
	if err == nil && d.Leg.Perp() {
		m.Submitted(d, now)
		s.Pos[id] = d.Want // later margin math this tick sees it
		return nil
	}
	if n := m.Done(err, now); n != nil {
		k.alert(ctx, id, *n)
		return fmt.Errorf("%s: %w", spec.Symbol, err)
	}
	return nil
}

func (k *Keeper) exec(ctx context.Context, id uint32, d Decision, s *snap) error {
	idx, size := s.Index[id], d.Leg.Size
	if idx <= 0 {
		return fmt.Errorf("no index price")
	}
	switch d.Leg.Kind {
	case LegOpenShort:
		if err := k.ensureMargin(ctx, id, d.Want, s); err != nil {
			return err
		}
		return k.place(ctx, id, d, idx, false)
	case LegCloseShort:
		return k.place(ctx, id, d, idx, true)
	case LegBuySpot:
		in := sizing.Notional(size, idx, true)
		if in > s.Idle-s.Pending() { // vault reverts Reserved on queue-owed idle
			return fmt.Errorf("buy spot needs %d USDC, idle %d, queued %d", in, s.Idle, s.Pending())
		}
		out := sizing.MulDiv(size, sizing.Bps-k.P.SlipBps, sizing.Bps, false)
		if err := k.Vault.Swap(ctx, Swap{Market: id, Buy: true, AmountIn: in, MinOut: out}); err != nil {
			return err
		}
		s.Idle -= in
		return nil
	case LegSellSpot:
		out := sizing.MulDiv(sizing.Notional(size, idx, false), sizing.Bps-k.P.SlipBps, sizing.Bps, false)
		return k.Vault.Swap(ctx, Swap{Market: id, Buy: false, AmountIn: size, MinOut: out})
	}
	return nil
}

// place sends an IOC limit at index +- slip, on tick; nonce/expiry deterministic per intent.
func (k *Keeper) place(ctx context.Context, id uint32, d Decision, idx int64, buy bool) error {
	o := Order{Market: id, Buy: buy, ReduceOnly: buy, Size: d.Leg.Size, Price: Limit(idx, k.specs[id].Tick, k.P.SlipBps, buy)}
	o.Nonce, o.ExpiryMs = OrderKey(k.Vault.Address(), o, d.From, d.Attempt, k.Clock.Now(), k.P.OrderTTL)
	return k.Perp.Place(ctx, o)
}

// Limit is the worst acceptable price: buys ceil above index, sells floor below, on tick.
func Limit(idx, tick, slipBps int64, buy bool) int64 {
	if buy {
		return sizing.CeilTo(sizing.MulDiv(idx, sizing.Bps+slipBps, sizing.Bps, true), tick)
	}
	return sizing.FloorTo(sizing.MulDiv(idx, sizing.Bps-slipBps, sizing.Bps, false), tick)
}
