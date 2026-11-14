package vaultchain

import (
	"context"
	"fmt"
	"math/big"

	"maas/backend/internal/platform/near"
	vk "maas/backend/internal/vaultkeeper"
)

// reader batches vault view calls and keeps the first error.
type reader struct {
	ctx  context.Context
	c    *near.Client
	addr string
	err  error
}

func (r *reader) view(method string, args, out any) {
	if r.err != nil {
		return
	}
	if err := r.c.View(r.ctx, r.addr, method, args, out); err != nil {
		r.err = fmt.Errorf("vaultchain: %s: %w", method, err)
	}
}

// big reads a U128/I128 string view; 0 on error.
func (r *reader) big(method string, args any) *big.Int {
	var s string
	r.view(method, args, &s)
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		if r.err == nil {
			r.err = fmt.Errorf("vaultchain: %s: bad int %q", method, s)
		}
		return new(big.Int)
	}
	return n
}

func (r *reader) int(n *big.Int) int64 {
	v, err := i64(n)
	if err != nil && r.err == nil {
		r.err = err
	}
	return v
}

// queue scans requests(1..next_request_id); fulfilled/cancelled ones are gone (null).
// shortcut: O(all ids ever) per tick, index withdraw_queued events if history grows large.
func (r *reader) queue(nav *big.Int) []vk.Withdrawal {
	var next uint64
	r.view("next_request_id", nil, &next)
	supply := r.big("ft_total_supply", nil)
	var q []vk.Withdrawal
	for id := uint64(1); id < next && r.err == nil; id++ {
		var req *struct {
			Shares string `json:"shares"`
		}
		r.view("requests", map[string]any{"id": id}, &req)
		if req == nil {
			continue
		}
		sh, ok := new(big.Int).SetString(req.Shares, 10)
		if !ok || sh.Sign() == 0 {
			continue
		}
		q = append(q, vk.Withdrawal{ID: id, Assets: r.int(queuedAssets(sh, nav, supply))})
	}
	return q
}
