package keeper

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"sort"
	"strconv"
	"sync"
	"time"

	"maas/backend/internal/keeper/liquidation"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/oracle"
)

// Onchain implements funding.Poster and liquidation.Chain on the exchange.
// One mutex serializes txs and price pushes.
type Onchain struct {
	Signer    *near.Signer
	Exchange  string
	Pool      string // POOL_CONTRACT, optional: maas-pool gets the same prices for its dynamic fee
	Prices    func() oracle.Snapshot
	PushEvery time.Duration // min gap between push_prices txs

	mu       sync.Mutex
	pushedAt time.Time
	pushed   time.Time // publish time of last pushed snapshot
}

// PushPrices sends push_prices if due and the snapshot is newer than the last push.
func (o *Onchain) PushPrices(ctx context.Context) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.pushPrices(ctx)
}

// pushPrices: caller holds mu.
func (o *Onchain) pushPrices(ctx context.Context) error {
	s := o.Prices()
	if len(s.Prices) == 0 || !s.PublishTime.After(o.pushed) || time.Since(o.pushedAt) < o.PushEvery {
		return nil
	}
	args := pricesArg(s)
	if _, err := o.call(ctx, "push_prices", map[string]any{"prices": args}); err != nil {
		return err
	}
	o.pushed, o.pushedAt = s.PublishTime, time.Now()
	if o.Pool != "" {
		// pool oracle is best effort: a stale pool price only raises trader fees to stale_fee_bps
		if _, err := o.Signer.Call(ctx, o.Pool, near.FunctionCall{Method: "push_prices", Args: near.Args(map[string]any{"prices": args}), Gas: 30 * near.TGas}); err != nil {
			slog.Warn("keeper: pool push_prices", "err", err)
		}
	}
	return nil
}

// pricesArg builds Vec<(u32, U128, u64)> sorted by market.
func pricesArg(s oracle.Snapshot) [][3]any {
	out := make([][3]any, 0, len(s.Prices))
	for m, p := range s.Prices {
		if p > 0 {
			out = append(out, [3]any{m, strconv.FormatInt(p, 10), s.Published[m].UnixMilli()})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i][0].(uint32) < out[j][0].(uint32) })
	return out
}

// UpdateFunding pushes a fresh price (funding reads mark) then posts rate.
func (o *Onchain) UpdateFunding(ctx context.Context, market uint32, rate *big.Int) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if err := o.pushPrices(ctx); err != nil {
		return err
	}
	_, err := o.call(ctx, "update_funding", map[string]any{"market_id": market, "rate": rate.String()})
	return err
}

// Liquidatable checks equity < mm onchain at the last pushed price.
func (o *Onchain) Liquidatable(ctx context.Context, account string) (bool, error) {
	o.mu.Lock()
	err := o.pushPrices(ctx)
	o.mu.Unlock()
	if err != nil {
		return false, err
	}
	arg := map[string]any{"account_id": account}
	var eq string
	var m struct{ Im, Mm string }
	if err := o.Signer.Client.View(ctx, o.Exchange, "equity", arg, &eq); err != nil {
		return false, err
	}
	if err := o.Signer.Client.View(ctx, o.Exchange, "margins", arg, &m); err != nil {
		return false, err
	}
	e, err1 := num(eq)
	mm, err2 := num(m.Mm)
	if err1 != nil || err2 != nil {
		return false, fmt.Errorf("keeper: bad equity/margins %q %q", eq, m.Mm)
	}
	return e.Cmp(mm) < 0, nil
}

// Positions reads position(account, id) for each market.
func (o *Onchain) Positions(ctx context.Context, account string, markets []uint32) ([]liquidation.Position, error) {
	out := make([]liquidation.Position, 0, len(markets))
	for _, id := range markets {
		var v struct {
			Size             string `json:"size"`
			EntryNotional    string `json:"entry_notional"`
			LastFundingIndex string `json:"last_funding_index"`
		}
		if err := o.Signer.Client.View(ctx, o.Exchange, "position", map[string]any{"account_id": account, "market_id": id}, &v); err != nil {
			return nil, err
		}
		p := liquidation.Position{Market: id}
		var err error
		for _, f := range []struct {
			s   string
			dst **big.Int
		}{{v.Size, &p.Size}, {v.EntryNotional, &p.EntryNotional}, {v.LastFundingIndex, &p.FundingIndex}} {
			if *f.dst, err = num(f.s); err != nil {
				return nil, err
			}
		}
		out = append(out, p)
	}
	return out, nil
}

// Liquidate sends liquidate at the pushed oracle mark.
func (o *Onchain) Liquidate(ctx context.Context, account string, market uint32) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	_, err := o.call(ctx, "liquidate", map[string]any{"account_id": account, "market_id": market})
	return err
}

func (o *Onchain) call(ctx context.Context, method string, args any) (*near.Outcome, error) {
	return o.Signer.Call(ctx, o.Exchange, near.FunctionCall{Method: method, Args: near.Args(args), Gas: 100 * near.TGas})
}

func num(s string) (*big.Int, error) {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return nil, fmt.Errorf("keeper: bad int %q", s)
	}
	return n, nil
}
