// Package vaultchain is vaultkeeper.Vault on the delta-vault contract.
package vaultchain

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"time"

	"maas/backend/internal/platform/near"
	vk "maas/backend/internal/vaultkeeper"
)

const opGas = 200 * near.TGas // vault op + exchange/Ref promise + callback

// Vault talks to delta-vault as its keeper. Idle = vault idle + its Ref USDC; legs move between them as needed.
type Vault struct {
	Signer *near.Signer
	Addr   string

	mu     sync.Mutex // one tx at a time
	dec    []uint8    // base token decimals per market
	maxAge time.Duration
}

// New reads market decimals and snapshot max age from the vault.
func New(ctx context.Context, sg *near.Signer, addr string) (*Vault, error) {
	v := &Vault{Signer: sg, Addr: addr}
	var ms []struct {
		BaseDecimals uint8 `json:"base_decimals"`
	}
	var cfg struct {
		MaxPriceAgeMs int64 `json:"max_price_age_ms"`
	}
	if err := sg.Client.View(ctx, addr, "markets", nil, &ms); err != nil {
		return nil, fmt.Errorf("vaultchain: markets: %w", err)
	}
	if err := sg.Client.View(ctx, addr, "config", nil, &cfg); err != nil {
		return nil, fmt.Errorf("vaultchain: config: %w", err)
	}
	for _, m := range ms {
		v.dec = append(v.dec, m.BaseDecimals)
	}
	v.maxAge = time.Duration(cfg.MaxPriceAgeMs) * time.Millisecond
	return v, nil
}

func (v *Vault) Address() string { return v.Addr }

func (v *Vault) State(ctx context.Context) (vk.VaultState, error) {
	if err := v.fresh(ctx); err != nil {
		return vk.VaultState{}, err
	}
	r := reader{ctx: ctx, c: v.Signer.Client, addr: v.Addr}
	st := vk.VaultState{Modes: map[uint32]vk.Mode{}, Spot: map[uint32]int64{}, Config: vk.Config{Weights: map[uint32]int64{}}}
	nav := r.big("nav", nil)
	st.NAV = r.int(nav)
	st.Idle = r.int(r.big("idle", nil)) + r.int(r.big("ref_usdc", nil))
	var cfg struct {
		WeightsBps       []int64 `json:"weights_bps"`
		ShortLeverageBps int64   `json:"short_leverage_bps"`
		IdleBufferBps    int64   `json:"idle_buffer_bps"`
	}
	r.view("config", nil, &cfg)
	st.Config.ShortLevBps, st.Config.IdleBufferBps = cfg.ShortLeverageBps, cfg.IdleBufferBps
	for i := range v.dec {
		id := uint32(i)
		var mode string
		r.view("mode", map[string]any{"market": id}, &mode)
		if mode == "Hedged" {
			st.Modes[id] = vk.ModeHedged
		}
		if i < len(cfg.WeightsBps) {
			st.Config.Weights[id] = cfg.WeightsBps[i]
		}
		st.Spot[id] = r.int(r.big("spot_size", map[string]any{"market": id}))
	}
	st.Queue = r.queue(nav)
	return st, r.err
}

// Swap is exact-in; base amounts scale from 1e8 to token decimals. Buys first top up Ref USDC from idle.
func (v *Vault) Swap(ctx context.Context, s vk.Swap) error {
	if int(s.Market) >= len(v.dec) {
		return fmt.Errorf("vaultchain: unknown market %d", s.Market)
	}
	dec := v.dec[s.Market]
	in, out := big.NewInt(s.AmountIn), big.NewInt(s.MinOut)
	if s.Buy {
		out = fromSize(s.MinOut, dec)
		if err := v.move(ctx, "ref_usdc", "ref_deposit", in); err != nil {
			return err
		}
	} else {
		in = fromSize(s.AmountIn, dec)
	}
	return v.send(ctx, "swap", map[string]any{"market": s.Market, "sell_base": !s.Buy, "amount_in": in.String(), "min_out": out.String()})
}

func (v *Vault) DepositMargin(ctx context.Context, usdc int64) error {
	if err := v.move(ctx, "idle", "ref_withdraw", big.NewInt(usdc)); err != nil {
		return err
	}
	return v.send(ctx, "deposit_margin", map[string]any{"amount": fmt.Sprint(usdc)})
}

// PayFees streams accrued withdraw fees to pool LPs + treasury (no-op on chain when nothing accrued).
func (v *Vault) PayFees(ctx context.Context) error { return v.call(ctx, "pay_fees", nil) }

// SetMode is keeper-only set_mode; the chain enforces cooldown.
func (v *Vault) SetMode(ctx context.Context, market uint32, m vk.Mode, reason string) error {
	mode := "Flat"
	if m == vk.ModeHedged {
		mode = "Hedged"
	}
	return v.send(ctx, "set_mode", map[string]any{"market": market, "mode": mode, "reason_ref": reason})
}

func (v *Vault) WithdrawMargin(ctx context.Context, usdc int64) error {
	return v.send(ctx, "withdraw_margin", map[string]any{"amount": fmt.Sprint(usdc)})
}

// Fulfill pulls Ref USDC back to idle if the request needs it, then pays it.
func (v *Vault) Fulfill(ctx context.Context, id uint64) error {
	st, err := v.State(ctx)
	if err != nil {
		return err
	}
	for _, w := range st.Queue {
		if w.ID == id {
			if err := v.move(ctx, "idle", "ref_withdraw", big.NewInt(w.Assets)); err != nil {
				return err
			}
		}
	}
	return v.send(ctx, "fulfill", map[string]any{"id": id})
}

// Events never fires. shortcut: keeper wakes on Interval only; tail vault events via the indexer if latency matters.
func (v *Vault) Events(context.Context) (<-chan vk.Event, error) { return make(chan vk.Event), nil }

// move tops up bucket (idle | ref_usdc view) to need via method (ref_withdraw | ref_deposit).
func (v *Vault) move(ctx context.Context, bucket, method string, need *big.Int) error {
	var have string
	if err := v.Signer.Client.View(ctx, v.Addr, bucket, nil, &have); err != nil {
		return err
	}
	h, ok := new(big.Int).SetString(have, 10)
	if !ok {
		return fmt.Errorf("vaultchain: bad %s %q", bucket, have)
	}
	if h.Cmp(need) >= 0 {
		return nil
	}
	return v.send(ctx, method, map[string]any{"amount": new(big.Int).Sub(need, h).String()})
}

// fresh calls sync() when the vault snapshot is past half its max age (ops reject stale ones).
func (v *Vault) fresh(ctx context.Context) error {
	var s struct {
		AtMs int64 `json:"at_ms"`
	}
	if err := v.Signer.Client.View(ctx, v.Addr, "snapshot", nil, &s); err != nil {
		return err
	}
	if time.Since(time.UnixMilli(s.AtMs)) < v.maxAge/2 {
		return nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.call(ctx, "sync", nil)
}

// send syncs if needed, then calls a keeper method.
func (v *Vault) send(ctx context.Context, method string, args any) error {
	if err := v.fresh(ctx); err != nil {
		return err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.call(ctx, method, args)
}

func (v *Vault) call(ctx context.Context, method string, args any) error {
	if _, err := v.Signer.Call(ctx, v.Addr, near.FunctionCall{Method: method, Args: near.Args(args), Gas: opGas}); err != nil {
		return fmt.Errorf("vault.%s: %w", method, err)
	}
	return nil
}
