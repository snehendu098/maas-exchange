package fake

import (
	"context"
	"errors"
	"fmt"
	"sync"

	vk "maas/backend/internal/vaultkeeper"
	"maas/backend/internal/vaultkeeper/sizing"
)

// Vault swaps at the perp index with no slippage and pays margin to/from Perp collateral.
type Vault struct {
	mu       sync.Mutex
	Perp     *Perp
	Cfg      vk.Config
	FailSwap int // revert the next n swaps

	idle  int64
	modes map[uint32]vk.Mode
	spot  map[uint32]int64
	queue []vk.Withdrawal
	next  uint64
	Paid  map[uint64]int64
	ch    chan vk.Event
}

const Addr = "vault.testnet"

func NewVault(p *Perp, cfg vk.Config, idle int64) *Vault {
	return &Vault{Perp: p, Cfg: cfg, idle: idle, modes: map[uint32]vk.Mode{}, spot: map[uint32]int64{},
		Paid: map[uint64]int64{}, ch: make(chan vk.Event, 64)}
}

func (v *Vault) Address() string { return Addr }

func (v *Vault) State(context.Context) (vk.VaultState, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	st := vk.VaultState{Idle: v.idle, Config: v.Cfg, Modes: map[uint32]vk.Mode{}, Spot: map[uint32]int64{},
		Queue: append([]vk.Withdrawal(nil), v.queue...)}
	st.NAV = v.idle + v.Perp.Col()
	for id, s := range v.spot {
		st.Spot[id] = s
		st.NAV += sizing.Notional(s, v.Perp.Prices[id], false)
	}
	for id, m := range v.modes {
		st.Modes[id] = m
	}
	return st, nil
}

func (v *Vault) Swap(_ context.Context, s vk.Swap) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.FailSwap > 0 {
		v.FailSwap--
		return errors.New("fake: swap reverted")
	}
	px := v.Perp.Prices[s.Market]
	if s.Buy {
		out := sizing.MulDiv(s.AmountIn, sizing.One, px, false)
		if s.AmountIn > v.idle || out < s.MinOut {
			return errors.New("fake: buy slippage/idle")
		}
		v.idle, v.spot[s.Market] = v.idle-s.AmountIn, v.spot[s.Market]+out
		return nil
	}
	out := sizing.Notional(s.AmountIn, px, false)
	if s.AmountIn > v.spot[s.Market] || out < s.MinOut {
		return errors.New("fake: sell slippage/balance")
	}
	v.idle, v.spot[s.Market] = v.idle+out, v.spot[s.Market]-s.AmountIn
	return nil
}

func (v *Vault) DepositMargin(_ context.Context, usdc int64) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if usdc > v.idle {
		return errors.New("fake: deposit > idle")
	}
	v.idle -= usdc
	v.Perp.AddCollateral(usdc)
	return nil
}

func (v *Vault) WithdrawMargin(_ context.Context, usdc int64) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if usdc > v.Perp.Col() {
		return errors.New("fake: withdraw > collateral")
	}
	v.Perp.AddCollateral(-usdc)
	v.idle += usdc
	return nil
}

func (v *Vault) Fulfill(_ context.Context, id uint64) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	for i, w := range v.queue {
		if w.ID != id {
			continue
		}
		if w.Assets > v.idle {
			return errors.New("fake: fulfill > idle")
		}
		v.idle -= w.Assets
		v.Paid[id] = w.Assets
		v.queue = append(v.queue[:i], v.queue[i+1:]...)
		return nil
	}
	return fmt.Errorf("fake: no request %d", id)
}

func (v *Vault) Events(context.Context) (<-chan vk.Event, error) { return v.ch, nil }

// SetMode mimics an offchain set_mode call.
func (v *Vault) SetMode(m uint32, mode vk.Mode) {
	v.mu.Lock()
	v.modes[m] = mode
	v.mu.Unlock()
	v.ch <- vk.Event{Kind: vk.ModeChanged, Market: m, Mode: mode}
}

// Request queues a withdrawal of assets USDC.
func (v *Vault) Request(assets int64) uint64 {
	v.mu.Lock()
	v.next++
	id := v.next
	v.queue = append(v.queue, vk.Withdrawal{ID: id, Assets: assets})
	v.mu.Unlock()
	v.ch <- vk.Event{Kind: vk.WithdrawRequested, Request: id}
	return id
}

func (v *Vault) Idle() int64 {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.idle
}

func (v *Vault) Spot(m uint32) int64 {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.spot[m]
}
