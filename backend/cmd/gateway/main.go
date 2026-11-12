package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"maas/backend/internal/gateway"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/logger"
)

func main() {
	slog.SetDefault(logger.New("gateway"))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		slog.Error("gateway exit", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	set, err := gateway.LoadSettings()
	if err != nil {
		return err
	}
	return gateway.Run(ctx, cfg, set)
}
