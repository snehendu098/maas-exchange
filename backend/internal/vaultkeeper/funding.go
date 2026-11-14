package vaultkeeper

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"slices"
	"sync"
	"time"
)

// Print is one funding print; Rate is the exchange's i128 decimal string (1e18 = 100%).
type Print struct {
	Ref  string // block:logIndex, sent as set_mode reason_ref
	Rate string
}

// Decide is the rebalance rule over a window of prints, oldest first:
// HEDGED -> FLAT when every print is negative; FLAT -> HEDGED when the latest is positive.
func Decide(mode Mode, prints []Print) Mode {
	if len(prints) == 0 {
		return mode
	}
	if mode == ModeHedged {
		for _, p := range prints {
			if sign(p.Rate) >= 0 {
				return mode
			}
		}
		return ModeFlat
	}
	if sign(prints[len(prints)-1].Rate) > 0 {
		return ModeHedged
	}
	return mode
}

func sign(rate string) int {
	r, ok := new(big.Rat).SetString(rate)
	if !ok {
		return 0 // unparseable never triggers a move
	}
	return r.Sign()
}

// ModeSetter is the keeper-only set_mode call.
type ModeSetter interface {
	State(ctx context.Context) (VaultState, error)
	SetMode(ctx context.Context, market uint32, m Mode, reason string) error
}

// Rebalancer applies Decide to every vault market on each check.
type Rebalancer struct {
	Vault  ModeSetter
	Prints func(ctx context.Context, market uint32) ([]Print, error) // the window, oldest first
}

// Check reads modes, decides per market, sets changed ones.
func (r Rebalancer) Check(ctx context.Context) error {
	st, err := r.Vault.State(ctx)
	if err != nil {
		return fmt.Errorf("rebalancer: vault state: %w", err)
	}
	ids := make([]uint32, 0, len(st.Modes))
	for id := range st.Modes {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	var errs []error
	for _, id := range ids {
		ps, err := r.Prints(ctx, id)
		if err != nil {
			errs = append(errs, fmt.Errorf("rebalancer: prints %d: %w", id, err))
			continue
		}
		cur := st.Modes[id]
		next := Decide(cur, ps)
		if next == cur {
			continue
		}
		ref := ps[len(ps)-1].Ref
		slog.Info("rebalancer: set_mode", "market", id, "from", cur, "to", next, "prints", len(ps), "ref", ref)
		if err := r.Vault.SetMode(ctx, id, next, ref); err != nil {
			errs = append(errs, fmt.Errorf("rebalancer: set_mode %d: %w", id, err))
		}
	}
	return errors.Join(errs...)
}

// Run checks now and then every `every` until ctx ends.
func (r Rebalancer) Run(ctx context.Context, every time.Duration) error {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := r.Check(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("rebalancer: check", "err", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
		}
	}
}

// IndexPrints reads funding prints straight from chain: the exchange's funding_index moves by
// rate x mark on every update (mark > 0), so each observed change is one print with the rate's sign.
// No indexer needed. Samples live in memory: until a full window has been observed, the unseen part
// counts as one non-negative print, so a restart never exits on a partial window.
type IndexPrints struct {
	Read   func(ctx context.Context, market uint32) (*big.Int, error)
	Window time.Duration
	Clock  Clock

	mu      sync.Mutex
	started time.Time
	last    map[uint32]*big.Int
	seen    map[uint32][]timedPrint
}

type timedPrint struct {
	at time.Time
	p  Print
}

func (x *IndexPrints) Prints(ctx context.Context, m uint32) ([]Print, error) {
	idx, err := x.Read(ctx, m)
	if err != nil {
		return nil, err
	}
	x.mu.Lock()
	defer x.mu.Unlock()
	now := x.Clock.Now()
	if x.last == nil {
		x.started, x.last, x.seen = now, map[uint32]*big.Int{}, map[uint32][]timedPrint{}
	}
	if prev, ok := x.last[m]; ok && prev.Cmp(idx) != 0 {
		d := new(big.Int).Sub(idx, prev)
		x.seen[m] = append(x.seen[m], timedPrint{now, Print{Ref: "funding_index:" + idx.String(), Rate: d.String()}})
	}
	x.last[m] = idx
	cut := now.Add(-x.Window)
	kept := x.seen[m][:0]
	for _, t := range x.seen[m] {
		if t.at.After(cut) {
			kept = append(kept, t)
		}
	}
	x.seen[m] = kept
	out := make([]Print, 0, len(kept)+1)
	if now.Sub(x.started) < x.Window && len(kept) > 0 {
		out = append(out, Print{Ref: "unobserved", Rate: "0"})
	}
	for _, t := range kept {
		out = append(out, t.p)
	}
	return out, nil
}
