package vaultkeeper

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"
)

// Params are keeper-level knobs on top of the per-market Policy.
type Params struct {
	Policy
	Interval  time.Duration
	BootGrace time.Duration // let in-flight fills settle before rebuilding from chain
	SlipBps   int64         // perp limit + swap minOut vs index
	OrderTTL  time.Duration
	MinMove   int64 // USDC; smaller deploys and margin moves are skipped
}

// Keeper converges every market to its target, one leg at a time, from chain state.
type Keeper struct {
	Vault  Vault
	Perp   Perp
	Clock  Clock
	Alerts Alerter
	P      Params

	specs map[uint32]Spec
	ids   []uint32
	ms    map[uint32]*Machine
}

// snap is one tick's read of chain + engine.
type snap struct {
	VaultState
	Index map[uint32]int64
	Pos   map[uint32]int64
	Col   int64
}

// Init loads markets and fresh machines; all state is rebuilt from chain on the first Tick.
func (k *Keeper) Init(ctx context.Context) error {
	specs, err := k.Perp.Markets(ctx)
	if err != nil {
		return err
	}
	if len(specs) == 0 {
		return errors.New("vaultkeeper: no perp markets")
	}
	k.specs, k.ms, k.ids = map[uint32]Spec{}, map[uint32]*Machine{}, nil
	for _, s := range specs {
		k.specs[s.ID], k.ms[s.ID] = s, NewMachine(s.ID, k.P.Policy)
		k.ids = append(k.ids, s.ID)
	}
	slices.Sort(k.ids)
	return nil
}

// Run ticks on Interval and on every vault event until ctx ends.
func (k *Keeper) Run(ctx context.Context) error {
	if err := k.Init(ctx); err != nil {
		return err
	}
	ev, err := k.Vault.Events(ctx)
	if err != nil {
		return err
	}
	slog.Info("vaultkeeper: boot grace", "wait", k.P.BootGrace, "markets", len(k.ids), "vault", k.Vault.Address())
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(k.P.BootGrace):
	}
	t := time.NewTicker(k.P.Interval)
	defer t.Stop()
	for {
		if err := k.Tick(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("vaultkeeper: tick", "err", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
		case e, ok := <-ev:
			if !ok {
				return errors.New("vaultkeeper: vault event stream closed")
			}
			slog.Info("vaultkeeper: event", "kind", e.Kind, "market", e.Market, "mode", e.Mode, "request", e.Request)
		}
	}
}

// Tick: read, then at rest settle treasury + plan, then step every market.
func (k *Keeper) Tick(ctx context.Context) error {
	s, err := k.read(ctx)
	if err != nil {
		return err
	}
	if k.allRest() {
		acted, err := k.treasury(ctx, &s)
		if acted || err != nil {
			return err
		}
		k.plan(s)
	}
	var errs []error
	for _, id := range k.ids {
		errs = append(errs, k.advance(ctx, id, &s))
	}
	return errors.Join(errs...)
}

func (k *Keeper) read(ctx context.Context) (snap, error) {
	st, err := k.Vault.State(ctx)
	if err != nil {
		return snap{}, fmt.Errorf("vault state: %w", err)
	}
	s := snap{VaultState: st, Pos: map[uint32]int64{}}
	if s.Index, err = k.Perp.Index(ctx); err != nil {
		return s, fmt.Errorf("perp index: %w", err)
	}
	if s.Col, err = k.Perp.Collateral(ctx); err != nil {
		return s, fmt.Errorf("perp collateral: %w", err)
	}
	for _, id := range k.ids {
		if s.Pos[id], err = k.Perp.Position(ctx, id); err != nil {
			return s, fmt.Errorf("perp position %d: %w", id, err)
		}
	}
	if s.Config.ShortLevBps <= 0 {
		return s, errors.New("vault config: shortLeverage must be > 0")
	}
	return s, nil
}

func (k *Keeper) allRest() bool {
	for _, m := range k.ms {
		if !m.AtRest() {
			return false
		}
	}
	return true
}

// Phase is market id's current phase (for status + tests).
func (k *Keeper) Phase(id uint32) Phase { return k.ms[id].Phase() }

func (k *Keeper) alert(ctx context.Context, id uint32, n Note) {
	slog.Log(ctx, map[Level]slog.Level{Info: slog.LevelInfo, Warn: slog.LevelWarn, Critical: slog.LevelError}[n.Level],
		"vaultkeeper: "+n.Msg, "market", k.specs[id].Symbol)
	if k.Alerts != nil {
		k.Alerts.Alert(ctx, Alert{n.Level, id, n.Msg})
	}
}
