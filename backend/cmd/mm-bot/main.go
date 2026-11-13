package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"maas/backend/internal/mmbot"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/logger"
	"maas/backend/internal/platform/near"
)

func main() {
	slog.SetDefault(logger.New("mm-bot"))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		slog.Error("mm-bot exit", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	set, err := mmbot.LoadSettings()
	if err != nil {
		return err
	}
	rpc := near.NewClient(cfg.RPCURL)
	sg, err := near.NewSigner(rpc, set.Account, set.Key)
	if err != nil {
		return err
	}
	if err := mmbot.Fund(ctx, sg, cfg.Exchange, cfg.USDC, set.MinCollat, set.Deposit); err != nil {
		return err
	}
	b := &mmbot.Bot{S: set, Self: mmbot.Wallet{Account: sg.Account, Key: sg.Key}, HTTP: &http.Client{Timeout: 5 * time.Second}}
	for _, w := range set.SimWallets { // skipped (logged) if unfunded
		ss, err := near.NewSigner(rpc, w.Account, w.Key)
		if err != nil {
			return err
		}
		if err := mmbot.Fund(ctx, ss, cfg.Exchange, cfg.USDC, set.SimDeposit/2, set.SimDeposit); err != nil {
			slog.Warn("mm-bot: sim wallet skipped", "wallet", w.Account, "err", err)
			continue
		}
		b.Sims = append(b.Sims, mmbot.Wallet{Account: ss.Account, Key: ss.Key})
	}
	return b.Run(ctx)
}
