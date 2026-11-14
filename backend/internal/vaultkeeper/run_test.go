package vaultkeeper_test

import (
	"context"
	"errors"
	"flag"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	vk "maas/backend/internal/vaultkeeper"
)

func TestMain(m *testing.M) {
	flag.Parse()
	if !testing.Verbose() {
		slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	}
	os.Exit(m.Run())
}

func TestRunWakesOnEventsAndStops(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.perp.SettleDelay = 0
	w.k.P.Interval, w.k.P.BootGrace = time.Hour, 0 // only events can wake it
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.k.Run(ctx) }()
	for range 4 { // buy spot, open short, settle: one wake per leg
		w.vault.SetMode(BTC, vk.ModeHedged)
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop on cancel")
	}
	if !w.hedged(BTC) {
		t.Fatalf("events did not drive legs: spot %d pos %d", w.vault.Spot(BTC), w.pos(BTC))
	}
}
