package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"maas/backend/internal/keeper"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/db"
	"maas/backend/internal/platform/logger"
)

func main() {
	slog.SetDefault(logger.New("keeper"))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		slog.Error("keeper exit", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	set, err := keeper.LoadSettings()
	if err != nil {
		return err
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	nc, js, err := bus.Connect(ctx, cfg.NATSURL)
	if err != nil {
		return err
	}
	defer nc.Close()
	k, err := keeper.New(ctx, cfg, set, pool)
	if err != nil {
		return err
	}
	slog.Info("keeper starting", "oracle", set.OracleMode, "funding_every", set.FundingEvery)
	return k.Run(ctx, js)
}
