// pythctl checks exchange pushed prices against Pyth Hermes; exit 1 on drift or stale.
// Env: as services (NEAR_RPC_URL, EXCHANGE_CONTRACT, MARKETS_CONFIG) + HERMES_URL/HERMES_API_KEY.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"os"
	"os/signal"
	"strconv"
	"text/tabwriter"

	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/logger"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/oracle"
)

func main() {
	slog.SetDefault(logger.New("pythctl"))
	maxDev := flag.Float64("max-dev-bps", 50, "max |onchain - hermes| in bps")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ok, err := run(ctx, *maxDev)
	if err != nil {
		slog.Error("pythctl", "err", err)
		os.Exit(1)
	}
	if !ok {
		os.Exit(1)
	}
}

func run(ctx context.Context, maxDev float64) (bool, error) {
	cfg, err := config.Load()
	if err != nil {
		return false, err
	}
	feeds := map[uint32]string{}
	for _, m := range cfg.Markets {
		feeds[m.ID] = m.FeedID
	}
	snap, err := oracle.HermesFromEnv(feeds).Latest(ctx)
	if err != nil {
		return false, fmt.Errorf("hermes: %w", err)
	}
	c := near.NewClient(cfg.RPCURL)
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', tabwriter.AlignRight)
	fmt.Fprintln(tw, "MARKET\tHERMES\tONCHAIN\tΔ bps\tSTATUS\t")
	ok := true
	for _, m := range cfg.Markets {
		var s string
		var onchain int64
		status := "ok"
		if err := c.View(ctx, cfg.Exchange, "price", map[string]any{"market_id": m.ID}, &s); err != nil {
			status = "STALE"
		} else {
			onchain, _ = strconv.ParseInt(s, 10, 64)
		}
		dev := devBps(onchain, snap.Prices[m.ID])
		if status == "ok" && (math.IsNaN(dev) || math.Abs(dev) > maxDev) {
			status = "DRIFT"
		}
		ok = ok && status == "ok"
		fmt.Fprintf(tw, "%s\t%s\t%s\t%+.1f\t%s\t\n", m.Symbol, usd(snap.Prices[m.ID]), usd(onchain), dev, status)
	}
	tw.Flush()
	return ok, nil
}

// devBps is got vs ref in basis points (NaN if ref == 0).
func devBps(got, ref int64) float64 {
	if ref == 0 {
		return math.NaN()
	}
	return float64(got-ref) / float64(ref) * 1e4
}

func usd(e6 int64) string {
	if e6 == 0 {
		return "-"
	}
	return fmt.Sprintf("$%.4f", float64(e6)/1e6)
}
