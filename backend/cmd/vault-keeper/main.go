package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/gwclient"
	"maas/backend/internal/platform/logger"
	"maas/backend/internal/platform/near"
	vk "maas/backend/internal/vaultkeeper"
	"maas/backend/internal/vaultkeeper/adapter/alert"
	"maas/backend/internal/vaultkeeper/adapter/perpgw"
	"maas/backend/internal/vaultkeeper/adapter/vaultchain"
)

func main() {
	slog.SetDefault(logger.New("vault-keeper"))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		slog.Error("vault-keeper exit", "err", err)
		os.Exit(1)
	}
	slog.Info("vault-keeper stopped")
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.Vault == "" {
		return errors.New("vault-keeper: VAULT_CONTRACT required")
	}
	set, err := vk.LoadSettings()
	if err != nil {
		return err
	}
	rpc := near.NewClient(cfg.RPCURL)
	sg, err := near.NewSigner(rpc, set.Account, set.Key)
	if err != nil {
		return err
	}
	tk, err := near.ParsePrivateKey(set.TradingKey)
	if err != nil {
		return err
	}
	vault, err := vaultchain.New(ctx, sg, cfg.Vault)
	if err != nil {
		return err
	}
	httpc := &http.Client{Timeout: 5 * time.Second}
	k := &vk.Keeper{
		Vault: vault, Clock: vk.SystemClock{}, P: set.Params,
		Perp: &perpgw.Perp{GW: gwclient.Client{Base: set.Gateway, HTTP: httpc}, Chain: rpc, Exchange: cfg.Exchange, Vault: cfg.Vault, Key: tk},
	}
	if set.AlertURL != "" {
		k.Alerts = alert.Webhook{C: gwclient.Client{Base: set.AlertURL, HTTP: httpc}}
	}
	ip := &vk.IndexPrints{Window: set.Window, Clock: vk.SystemClock{}, Read: func(ctx context.Context, m uint32) (*big.Int, error) {
		var v string // I128 decimal string
		if err := rpc.View(ctx, cfg.Exchange, "funding_index", map[string]any{"market_id": m}, &v); err != nil {
			return nil, err
		}
		n, ok := new(big.Int).SetString(v, 10)
		if !ok {
			return nil, fmt.Errorf("bad funding_index %q", v)
		}
		return n, nil
	}}
	rb := vk.Rebalancer{Vault: vault, Prints: ip.Prints}
	go rb.Run(ctx, set.Rebalance)
	go func() { // hourly: LP half of withdraw fees -> pool reward streams, rest -> treasury
		t := time.NewTicker(set.Rebalance)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := vault.PayFees(ctx); err != nil {
					slog.Warn("vault-keeper: pay_fees", "err", err)
				}
			}
		}
	}()
	slog.Info("vault-keeper: start", "vault", cfg.Vault, "signer", sg.Account, "gateway", set.Gateway, "funding_window", set.Window)
	return k.Run(ctx)
}
