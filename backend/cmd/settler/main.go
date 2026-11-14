package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/db"
	"maas/backend/internal/platform/logger"
	"maas/backend/internal/settler"
)

func main() {
	slog.SetDefault(logger.New("settler"))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		slog.Error("settler exit", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	set, err := settler.LoadSettings()
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
	s, err := settler.New(cfg, set, pool, js)
	if err != nil {
		return err
	}
	slog.Info("settler starting", "batch", set.BatchSize, "wait", set.BatchWait)
	return s.Run(ctx)
}
