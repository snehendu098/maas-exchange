package gateway

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/nats-io/nats.go/jetstream"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/feed"
	ghttp "maas/backend/internal/gateway/http"
	"maas/backend/internal/gateway/store"
	"maas/backend/internal/gateway/ws"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/db"
	"maas/backend/internal/platform/near"
)

// Settings is gateway-only env.
type Settings struct {
	Addr      string        // GATEWAY_ADDR, default :8080
	BandBps   uint64        // GATEWAY_PRICE_BAND_BPS, default 500
	RateLimit int           // GATEWAY_RATE_LIMIT req/s per IP, default 50, 0 = off
	Funding   time.Duration // FUNDING_INTERVAL (keeper's), default 1h
	FundBps   int64         // FUNDING_INTEREST_BPS_DAY (keeper's), default 3
	FundCap   *big.Int      // FUNDING_CAP (keeper's), default 1e15
	Exclude   []string      // GATEWAY_LEADERBOARD_EXCLUDE, comma-separated account ids (mm-bot)
}

func LoadSettings() (Settings, error) {
	s := Settings{Addr: os.Getenv("GATEWAY_ADDR"), BandBps: 500, RateLimit: 50, Funding: time.Hour, FundBps: 3, FundCap: big.NewInt(1e15)}
	if s.Addr == "" {
		s.Addr = ":8080"
	}
	var errs []error
	for _, a := range strings.Split(os.Getenv("GATEWAY_LEADERBOARD_EXCLUDE"), ",") {
		if a = strings.TrimSpace(a); a != "" {
			s.Exclude = append(s.Exclude, a)
		}
	}
	if v := os.Getenv("GATEWAY_PRICE_BAND_BPS"); v != "" {
		n, err := strconv.ParseUint(v, 10, 64)
		errs, s.BandBps = append(errs, err), n
	}
	if v := os.Getenv("GATEWAY_RATE_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		errs, s.RateLimit = append(errs, err), n
	}
	if v := os.Getenv("FUNDING_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err == nil && d <= 0 {
			err = errors.New("must be > 0")
		}
		errs, s.Funding = append(errs, err), d
	}
	if v := os.Getenv("FUNDING_INTEREST_BPS_DAY"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		errs, s.FundBps = append(errs, err), n
	}
	if v := os.Getenv("FUNDING_CAP"); v != "" {
		c, ok := new(big.Int).SetString(v, 10)
		if !ok {
			errs = append(errs, errors.New("FUNDING_CAP must be an int"))
		}
		s.FundCap = c
	}
	if err := errors.Join(errs...); err != nil {
		return s, fmt.Errorf("gateway: settings: %w", err)
	}
	return s, nil
}

// Run serves REST + WS until ctx ends.
func Run(ctx context.Context, cfg config.Config, set Settings) error {
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
	st := &store.Store{Pool: pool, Chain: near.NewClient(cfg.RPCURL), Exchange: cfg.Exchange}
	markets, err := st.Markets(ctx, cfg.Markets)
	if err != nil {
		return fmt.Errorf("gateway: load markets: %w", err)
	}

	hub := &ws.Hub{}
	f := feed.New(markets)
	f.Publish = hub.Publish
	f.OrderAt = func(ctx context.Context, seq uint64) (*perpv1.Order, error) { return bus.OrderAt(ctx, js, seq) }
	f.OnChain = userChanged(ctx, hub, st)
	hub.Snapshot = f.Snapshot
	srv := &ghttp.Server{
		Feed: f, Store: st, JS: js, OrderAt: f.OrderAt, Keys: (&keyCache{fetch: st.TradingKeys, ttl: time.Minute, m: map[string]keyEntry{}}).Get,
		BandBps: set.BandBps, Funding: set.Funding, FundBps: set.FundBps, FundCap: set.FundCap, Now: time.Now, Exclude: set.Exclude,
	}
	return Serve(ctx, set, srv, hub, js)
}

// Serve runs feed, ticker and HTTP; split from Run so integration tests can inject deps.
func Serve(ctx context.Context, set Settings, srv *ghttp.Server, hub *ws.Hub, js jetstream.JetStream) error {
	go srv.Feed.Run(ctx, js)
	go ticker(ctx, hub, srv)
	hs := &http.Server{Addr: set.Addr, Handler: srv.Handler(hub, set.RateLimit), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		hs.Shutdown(sctx)
	}()
	slog.Info("gateway listening", "addr", set.Addr, "markets", len(srv.Feed.Markets))
	if err := hs.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return ctx.Err()
}

// userChanged pushes fresh account/position on onchain updates, only to subscribed traders.
func userChanged(ctx context.Context, hub *ws.Hub, st *store.Store) func(string, int) {
	return func(trader string, market int) {
		key := "user:" + trader
		if !hub.Has(key) {
			return
		}
		go func() {
			if market >= 0 {
				if p, err := st.Position(ctx, trader, market); err == nil {
					hub.Publish(key, api.UserEvent{Type: "position", Position: &p})
				}
			}
			if a, err := st.Account(ctx, trader); err == nil {
				hub.Publish(key, api.UserEvent{Type: "account", Account: &a})
			}
		}()
	}
}

// ticker pushes market stats every 2s while anyone listens.
func ticker(ctx context.Context, hub *ws.Hub, srv *ghttp.Server) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if !hub.Has("ticker") {
			continue
		}
		st, err := srv.Stats(ctx)
		if err != nil {
			slog.Warn("gateway: ticker", "err", err)
			continue
		}
		for _, s := range st {
			hub.Publish("ticker", s)
		}
	}
}
