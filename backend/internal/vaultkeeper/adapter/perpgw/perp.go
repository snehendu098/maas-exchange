// Package perpgw is vaultkeeper.Perp: orders go to the gateway signed for the vault, reads come from exchange views.
package perpgw

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"

	"maas/backend/internal/gateway/api"
	"maas/backend/internal/platform/gwclient"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
	vk "maas/backend/internal/vaultkeeper"
)

type Perp struct {
	GW       gwclient.Client
	Chain    *near.Client
	Exchange string
	Vault    string             // trader
	Key      ed25519.PrivateKey // vault trading key (add_vault_trading_key)
}

func (p *Perp) Markets(ctx context.Context) ([]vk.Spec, error) {
	ms, err := p.GW.Markets(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]vk.Spec, len(ms))
	for i, m := range ms {
		out[i] = vk.Spec{ID: m.ID, Symbol: m.Symbol, Lot: int64(m.Lot), Tick: int64(m.Tick)}
	}
	return out, nil
}

func (p *Perp) Index(ctx context.Context) (map[uint32]int64, error) {
	var st []api.MarketStats
	if err := p.GW.Do(ctx, "GET", "/markets/stats", nil, &st); err != nil {
		return nil, err
	}
	out := map[uint32]int64{}
	for _, s := range st {
		out[s.Market], _ = strconv.ParseInt(s.IndexPrice, 10, 64)
	}
	return out, nil
}

// Position is the settled onchain size: a leg only counts once the settler landed it.
func (p *Perp) Position(ctx context.Context, market uint32) (int64, error) {
	var v struct {
		Size string `json:"size"`
	}
	if err := p.Chain.View(ctx, p.Exchange, "position", map[string]any{"account_id": p.Vault, "market_id": market}, &v); err != nil {
		return 0, err
	}
	return strconv.ParseInt(v.Size, 10, 64)
}

func (p *Perp) Collateral(ctx context.Context) (int64, error) {
	var c string
	if err := p.Chain.View(ctx, p.Exchange, "collateral", map[string]any{"account_id": p.Vault}, &c); err != nil {
		return 0, err
	}
	return strconv.ParseInt(c, 10, 64)
}

// Place submits an IOC limit; a duplicate hash is deduped by the gateway and capped by filled[hash].
func (p *Perp) Place(ctx context.Context, o vk.Order) error {
	so := sign.Order{Trader: p.Vault, MarketID: o.Market, IsBuy: o.Buy, Price: uint64(o.Price), Size: uint64(o.Size),
		ReduceOnly: o.ReduceOnly, Nonce: o.Nonce, ExpiryMs: o.ExpiryMs}
	h, sig := sign.SignOrder(so, p.Key)
	side := map[bool]string{true: "SIDE_BUY", false: "SIDE_SELL"}[o.Buy]
	var st api.OrderStatus
	err := p.GW.Do(ctx, "POST", "/orders", api.PlaceOrderRequest{
		Trader: p.Vault, Market: o.Market, Side: side, Type: "ORDER_TYPE_LIMIT",
		Tif: "TIME_IN_FORCE_IOC", Price: fmt.Sprint(o.Price), Size: fmt.Sprint(o.Size), ReduceOnly: o.ReduceOnly,
		Nonce: fmt.Sprint(o.Nonce), ExpiryMs: fmt.Sprint(o.ExpiryMs), ClientID: "vault-keeper",
		OrderHash: hex.EncodeToString(h[:]), Signature: base64.StdEncoding.EncodeToString(sig),
		PublicKey: near.PublicKeyString(p.Key.Public().(ed25519.PublicKey)),
	}, &st)
	if err != nil {
		return err
	}
	if st.State == "ORDER_STATE_REJECTED" {
		return fmt.Errorf("order %s rejected: %s", st.OrderID, st.Reason)
	}
	return nil
}
