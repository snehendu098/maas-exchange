package liquidation

import (
	"context"
	"log/slog"
	"maps"
	"math/big"
	"slices"
	"time"

	"maas/backend/internal/platform/oracle"
)

// Store reads the indexer's read model.
type Store interface {
	Accounts(ctx context.Context) ([]Account, error)
	Markets(ctx context.Context) (map[uint32]Market, error)
}

// Chain confirms (equity < mm), reads positions and sends liquidate onchain.
// Liquidatable pushes the oracle price first.
type Chain interface {
	Liquidatable(ctx context.Context, account string) (bool, error)
	Positions(ctx context.Context, account string, markets []uint32) ([]Position, error)
	Liquidate(ctx context.Context, account string, market uint32) error
}

// Scanner checks every account against the index and liquidates.
type Scanner struct {
	Store     Store
	Chain     Chain
	Prices    func() oracle.Snapshot
	Insurance string // account id; contract never liquidates it
}

// Scan: db + local math prefilter, chain confirms and picks market; returns txs sent.
// shortcut: one position per account per scan, worst loser first; rescans finish.
func (s *Scanner) Scan(ctx context.Context) (int, error) {
	accts, err := s.Store.Accounts(ctx)
	if err != nil {
		return 0, err
	}
	mkts, err := s.Store.Markets(ctx)
	if err != nil {
		return 0, err
	}
	snap := s.Prices()
	ids := slices.Sorted(maps.Keys(mkts))
	sent := 0
	for _, a := range accts {
		if a.Addr == s.Insurance || !Liquidatable(a, snap.Prices, mkts) {
			continue
		}
		ok, err := s.Chain.Liquidatable(ctx, a.Addr)
		if err != nil {
			slog.Warn("liquidate: chain check", "account", a.Addr, "err", err)
			continue
		}
		if !ok {
			slog.Debug("liquidate: chain says healthy", "account", a.Addr)
			continue
		}
		// db lags chain; pick from onchain positions so closed markets are never retried
		ps, err := s.Chain.Positions(ctx, a.Addr, ids)
		if err != nil {
			slog.Warn("liquidate: chain positions", "account", a.Addr, "err", err)
			continue
		}
		m, ok := pick(ps, snap.Prices, mkts)
		if !ok {
			continue
		}
		if err := s.Chain.Liquidate(ctx, a.Addr, m); err != nil {
			slog.Error("liquidate", "account", a.Addr, "market", m, "err", err)
			continue
		}
		slog.Info("liquidated", "account", a.Addr, "market", m)
		sent++
	}
	return sent, nil
}

// Run scans every interval until ctx ends.
func (s *Scanner) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if _, err := s.Scan(ctx); err != nil {
			slog.Error("liquidation scan", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// pick: open position with most negative uPnL, else biggest MM. ok=false if none priced.
func pick(ps []Position, prices map[uint32]int64, mkts map[uint32]Market) (uint32, bool) {
	var loser, top uint32
	var worst, topMM *big.Int
	for _, p := range ps {
		px := prices[p.Market]
		if p.Size.Sign() == 0 || px <= 0 {
			continue
		}
		if u := UPnL(p, Notional(px, p.Size)); u.Sign() < 0 && (worst == nil || u.Cmp(worst) < 0) {
			loser, worst = p.Market, u
		}
		if mm := MM(px, p.Size, mkts[p.Market].MMRBps); topMM == nil || mm.Cmp(topMM) > 0 {
			top, topMM = p.Market, mm
		}
	}
	if worst != nil {
		return loser, true
	}
	return top, topMM != nil
}
