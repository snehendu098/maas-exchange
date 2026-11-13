package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"maas/backend/internal/indexer"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/db"
	"maas/backend/internal/platform/logger"
)

func main() {
	log := logger.New("indexer")
	if err := run(log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("exit", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load()
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
	symbols := map[uint32]string{}
	for _, m := range cfg.Markets {
		symbols[m.ID] = m.Symbol
	}
	src := indexer.NewFetcher(cfg.Network, os.Getenv("FASTNEAR_API_KEY"))
	return indexer.New(indexer.Config{
		Contracts:  indexer.Contracts{Exchange: cfg.Exchange, Vault: cfg.Vault},
		StartBlock: cfg.StartBlock,
		Poll:       cfg.Poll,
		Symbols:    symbols,
	}, src, pool, js, log).Run(ctx)
}
