package http

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go/jetstream"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/feed"
	"maas/backend/internal/gateway/store"
	"maas/backend/internal/keeper/funding"
)

// Publisher is the JetStream publish subset (fake in tests).
type Publisher interface {
	Publish(ctx context.Context, subj string, data []byte, opts ...jetstream.PublishOpt) (*jetstream.PubAck, error)
}

type Server struct {
	Feed    *feed.Feed
	Store   *store.Store
	JS      Publisher
	OrderAt func(ctx context.Context, seq uint64) (*perpv1.Order, error)
	Keys    func(ctx context.Context, trader string) ([]string, error) // trader's registered trading keys
	BandBps uint64                                                     // max |price - index| / index
	Funding time.Duration                                              // keeper funding interval, for nextFundingTime
	FundBps int64                                                      // keeper base rate, for predicted funding
	FundCap *big.Int                                                   // keeper per-period cap; nil = last posted rate shown
	Now     func() time.Time
	Exclude []string // account ids hidden from /leaderboard (mm-bot)
}

// Handler routes the client live.ts paths.
func (s *Server) Handler(ws http.Handler, ratePerSec int) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /ws", ws)
	mux.HandleFunc("GET /markets", s.markets)
	mux.HandleFunc("GET /markets/stats", s.stats)
	mux.HandleFunc("GET /book/{market}", s.book)
	mux.HandleFunc("GET /trades/{market}", s.trades)
	mux.HandleFunc("GET /candles/{market}", s.candles)
	mux.HandleFunc("GET /account", s.trader(func(r *http.Request, t string) (any, error) { return s.Store.Account(r.Context(), t) }))
	mux.HandleFunc("GET /positions", s.trader(func(r *http.Request, t string) (any, error) { return s.Store.Positions(r.Context(), t) }))
	mux.HandleFunc("GET /funding", s.trader(func(r *http.Request, t string) (any, error) { return s.Store.Funding(r.Context(), t) }))
	mux.HandleFunc("GET /funding/{market}", s.fundingRates)
	mux.HandleFunc("GET /leaderboard", s.leaderboard)
	mux.HandleFunc("GET /orders", s.trader(func(_ *http.Request, t string) (any, error) { return s.Feed.OpenOrders(t), nil }))
	mux.HandleFunc("GET /fills", s.trader(func(_ *http.Request, t string) (any, error) { return s.Feed.Fills(t, 100), nil }))
	mux.HandleFunc("POST /orders", s.place)
	mux.HandleFunc("DELETE /orders/{id}", s.cancel)
	return cors(limit(mux, ratePerSec))
}

// apiErr is a JSON {code, message} error with HTTP status.
type apiErr struct {
	status int
	body   api.Error
}

func (e *apiErr) Error() string { return e.body.Code + ": " + e.body.Message }

func fail(status int, code, msg string) *apiErr {
	return &apiErr{status, api.Error{Code: code, Message: msg}}
}

func reply(w http.ResponseWriter, v any, err error) {
	w.Header().Set("Content-Type", "application/json")
	var e *apiErr
	if err != nil && !errors.As(err, &e) {
		slog.Warn("gateway: internal", "err", err)
		e = fail(http.StatusInternalServerError, "INTERNAL", "internal error")
	}
	if e != nil {
		w.WriteHeader(e.status)
		v = e.body
	}
	json.NewEncoder(w).Encode(v)
}

func (s *Server) trader(fn func(*http.Request, string) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t := store.AccountID(r.URL.Query().Get("trader"))
		if t == "" {
			reply(w, nil, fail(400, "BAD_REQUEST", "trader must be a NEAR account id"))
			return
		}
		v, err := fn(r, t)
		reply(w, v, err)
	}
}

func (s *Server) market(r *http.Request) (api.Market, *apiErr) {
	id, err := strconv.ParseUint(r.PathValue("market"), 10, 32)
	m, ok := s.Feed.Markets[uint32(id)]
	if err != nil || !ok {
		return m, fail(404, "UNKNOWN_MARKET", "unknown market "+r.PathValue("market"))
	}
	return m, nil
}

func intQ(r *http.Request, k string, def, max int) int {
	n, err := strconv.Atoi(r.URL.Query().Get(k))
	if err != nil || n <= 0 {
		return def
	}
	return min(n, max)
}

func (s *Server) markets(w http.ResponseWriter, _ *http.Request) {
	out := []api.Market{}
	for _, m := range s.Feed.Markets {
		out = append(out, m)
	}
	slices.SortFunc(out, func(a, b api.Market) int { return int(a.ID) - int(b.ID) })
	reply(w, out, nil)
}

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	st, err := s.Stats(r.Context())
	reply(w, st, err)
}

// Stats = db fields + mark (book mid, else index) + index from feed.
func (s *Server) Stats(ctx context.Context) ([]api.MarketStats, error) {
	ids := make([]uint32, 0, len(s.Feed.Markets))
	for id := range s.Feed.Markets {
		ids = append(ids, id)
	}
	st, err := s.Store.Stats(ctx, ids)
	if err != nil {
		return nil, err
	}
	next := s.Now().Truncate(s.Funding).Add(s.Funding).Unix()
	for i := range st {
		idx, _ := s.Feed.Index(st[i].Market)
		mark, ok := s.Feed.Mid(st[i].Market)
		if !ok {
			mark = idx
		}
		st[i].MarkPrice, st[i].IndexPrice, st[i].NextFundingTime = strconv.FormatUint(mark, 10), strconv.FormatUint(idx, 10), next
		if s.FundCap != nil && idx > 0 { // predicted next rate (keeper formula on live mid)
			st[i].FundingRate = funding.Rate(int64(mark), int64(idx), max(int64(24*time.Hour/s.Funding), 1), s.FundBps, s.FundCap).String()
		}
	}
	return st, nil
}

func (s *Server) book(w http.ResponseWriter, r *http.Request) {
	m, e := s.market(r)
	if e != nil {
		reply(w, nil, e)
		return
	}
	reply(w, s.Feed.Book(m.ID, intQ(r, "depth", 50, 500)), nil)
}

func (s *Server) trades(w http.ResponseWriter, r *http.Request) {
	m, e := s.market(r)
	if e != nil {
		reply(w, nil, e)
		return
	}
	reply(w, s.Feed.Trades(m.ID, intQ(r, "limit", 50, feed.History)), nil)
}

func (s *Server) candles(w http.ResponseWriter, r *http.Request) {
	m, e := s.market(r)
	if e != nil {
		reply(w, nil, e)
		return
	}
	iv, ok := store.Intervals[r.URL.Query().Get("interval")]
	if !ok {
		reply(w, nil, fail(400, "BAD_REQUEST", "interval must be 1m|5m|15m|1h|4h|1d"))
		return
	}
	cs, err := s.Store.Candles(r.Context(), m.ID, iv, intQ(r, "limit", 300, 1000))
	reply(w, cs, err)
}

// fundingRates: ?window= Go duration, default 3h, max 7d.
func (s *Server) fundingRates(w http.ResponseWriter, r *http.Request) {
	m, e := s.market(r)
	if e != nil {
		reply(w, nil, e)
		return
	}
	win, err := time.ParseDuration(cmp.Or(r.URL.Query().Get("window"), "3h"))
	if err != nil || win <= 0 || win > 7*24*time.Hour {
		reply(w, nil, fail(400, "BAD_REQUEST", "window must be a duration in (0, 168h]"))
		return
	}
	fs, err := s.Store.FundingRates(r.Context(), m.ID, s.Now().Add(-win))
	reply(w, fs, err)
}

// leaderboardWindows: ?window=, default 7d.
var leaderboardWindows = map[string]time.Duration{"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour, "all": 0}

func (s *Server) leaderboard(w http.ResponseWriter, r *http.Request) {
	win, ok := leaderboardWindows[cmp.Or(r.URL.Query().Get("window"), "7d")]
	if !ok {
		reply(w, nil, fail(400, "BAD_REQUEST", "window must be 24h, 7d, 30d or all"))
		return
	}
	since := time.Unix(0, 0)
	if win > 0 {
		since = s.Now().Add(-win)
	}
	rows, err := s.Store.Leaderboard(r.Context(), since, s.Exclude)
	reply(w, rows, err)
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// limit is a per-IP fixed 1s window (0 = off). Internal callers (loopback/private peer, no XFF: mm-bot,
// services) are exempt; caddy always sets XFF. shortcut: in-process only, token bucket / proxy if needed.
func limit(h http.Handler, perSec int) http.Handler {
	if perSec <= 0 {
		return h
	}
	var mu sync.Mutex
	window, hits := time.Now().Unix(), map[string]int{}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if internal(r) {
			h.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r)
		mu.Lock()
		if now := time.Now().Unix(); now != window {
			window, hits = now, map[string]int{}
		}
		hits[ip]++
		over := hits[ip] > perSec
		mu.Unlock()
		if over {
			reply(w, nil, fail(http.StatusTooManyRequests, "RATE_LIMITED", "too many requests"))
			return
		}
		h.ServeHTTP(w, r)
	})
}

// clientIP trusts last X-Forwarded-For hop (set by caddy) only from loopback/private peers;
// leftmost entries are client-controlled.
func clientIP(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	peer := net.ParseIP(host)
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" || peer == nil || !(peer.IsLoopback() || peer.IsPrivate()) {
		return host
	}
	return strings.TrimSpace(xff[strings.LastIndex(xff, ",")+1:])
}

func internal(r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	peer := net.ParseIP(host)
	return r.Header.Get("X-Forwarded-For") == "" && peer != nil && (peer.IsLoopback() || peer.IsPrivate())
}
