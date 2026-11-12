package http

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/feed"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
)

type pub struct {
	subj string
	data []byte
	seq  uint64
}

func (p *pub) Publish(_ context.Context, subj string, data []byte, _ ...jetstream.PublishOpt) (*jetstream.PubAck, error) {
	p.subj, p.data, p.seq = subj, data, p.seq+1
	return &jetstream.PubAck{Sequence: 41 + p.seq}, nil
}

var (
	now     = time.Unix(1_800_000_000, 0)
	key     = ed25519.NewKeyFromSeed(make([]byte, 32))
	pubKey  = near.PublicKeyString(key.Public().(ed25519.PublicKey))
	trader  = "alice.testnet"
	markets = map[uint32]api.Market{0: {ID: 0, Symbol: "BTC", TickSize: "100000", LotSize: "10000", Tick: 100000, Lot: 10000}}
)

func newServer(t *testing.T) (*Server, *pub) {
	f := feed.New(markets)
	b, _ := proto.Marshal(&perpv1.ChainUpdate{Update: &perpv1.ChainUpdate_Mark{Mark: &perpv1.MarkPrice{Market: 0, Price: 100_000e6}}})
	f.OnIn(context.Background(), 1, now, b)
	p := &pub{}
	keys := func(context.Context, string) ([]string, error) { return []string{pubKey}, nil }
	return &Server{Feed: f, JS: p, Keys: keys, BandBps: 500, Funding: time.Hour, Now: func() time.Time { return now }}, p
}

// signed builds a valid BTC limit buy, applies mut, then re-hashes + signs (unless mut sets hash/sig).
func signed(mut func(*api.PlaceOrderRequest)) api.PlaceOrderRequest {
	r := api.PlaceOrderRequest{
		Trader: trader, Market: 0, Side: "SIDE_BUY", Type: "ORDER_TYPE_LIMIT", Tif: "TIME_IN_FORCE_GTC",
		Price: "100000000000", Size: "100000000", Nonce: "7", ExpiryMs: strconv.FormatInt(now.UnixMilli()+60_000, 10), ClientID: "c1",
		PublicKey: pubKey,
	}
	mut(&r)
	u := func(s string) uint64 { n, _ := strconv.ParseUint(s, 10, 64); return n }
	if r.OrderHash == "" {
		o := sign.Order{Trader: r.Trader, MarketID: r.Market, IsBuy: r.Side == "SIDE_BUY", Price: u(r.Price),
			Size: u(r.Size), ReduceOnly: r.ReduceOnly, Nonce: u(r.Nonce), ExpiryMs: u(r.ExpiryMs)}
		h, sig := sign.SignOrder(o, key)
		r.OrderHash = hex.EncodeToString(h[:])
		if r.Signature == "" {
			r.Signature = base64.StdEncoding.EncodeToString(sig)
		}
	}
	return r
}

func post(t *testing.T, s *Server, r api.PlaceOrderRequest) (int, map[string]any) {
	b, _ := json.Marshal(r)
	w := httptest.NewRecorder()
	s.Handler(http.NotFoundHandler(), 0).ServeHTTP(w, httptest.NewRequest("POST", "/orders", bytes.NewReader(b)))
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestPlaceValid(t *testing.T) {
	s, p := newServer(t)
	code, out := post(t, s, signed(func(*api.PlaceOrderRequest) {}))
	if code != 200 || out["orderId"] != "42" || out["state"] != "ORDER_STATE_ACCEPTED" {
		t.Fatalf("%d %v", code, out)
	}
	var o perpv1.Order
	if p.subj != "engine.in.order.BTC" || proto.Unmarshal(p.data, &o) != nil || o.Price != 100_000e6 || len(o.Signature) != 64 || len(o.PublicKey) != 32 || o.Trader != trader {
		t.Fatalf("published %s %v", p.subj, &o)
	}
}

func TestPlaceRejects(t *testing.T) {
	other := ed25519.NewKeyFromSeed(append(make([]byte, 31), 1))
	for _, c := range []struct {
		code string
		mut  func(*api.PlaceOrderRequest)
	}{
		{"BAD_SIGNATURE", func(r *api.PlaceOrderRequest) {
			r.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(other, []byte("x")))
		}},
		{"BAD_SIGNATURE", func(r *api.PlaceOrderRequest) { r.PublicKey = near.PublicKeyString(other.Public().(ed25519.PublicKey)) }},
		{"BAD_ORDER_HASH", func(r *api.PlaceOrderRequest) { r.OrderHash = hex.EncodeToString(make([]byte, 32)) }},
		{"INVALID_TICK", func(r *api.PlaceOrderRequest) { r.Price = "100000000001" }},
		{"INVALID_LOT", func(r *api.PlaceOrderRequest) { r.Size = "100000001" }},
		{"ZERO_SIZE", func(r *api.PlaceOrderRequest) { r.Size = "0" }},
		{"EXPIRED", func(r *api.PlaceOrderRequest) { r.ExpiryMs = strconv.FormatInt(now.UnixMilli(), 10) }},
		{"MISSING_NONCE", func(r *api.PlaceOrderRequest) { r.Nonce = "0" }},
		{"PRICE_BAND", func(r *api.PlaceOrderRequest) { r.Price = "106000000000" }},
		{"UNKNOWN_MARKET", func(r *api.PlaceOrderRequest) { r.Market = 9 }},
		{"MISSING_PRICE", func(r *api.PlaceOrderRequest) { r.Type, r.Tif, r.Price = "ORDER_TYPE_MARKET", "TIME_IN_FORCE_IOC", "0" }},
		{"BAD_REQUEST", func(r *api.PlaceOrderRequest) { r.Side = "LONG" }},
		{"BAD_REQUEST", func(r *api.PlaceOrderRequest) { r.Trader = "0xAbC" }},
	} {
		s, p := newServer(t)
		code, out := post(t, s, signed(c.mut))
		if code < 400 || out["code"] != c.code || p.subj != "" {
			t.Errorf("%s: got %d %v published=%q", c.code, code, out, p.subj)
		}
	}
}

func TestPlaceUnknownKey(t *testing.T) {
	s, p := newServer(t)
	s.Keys = func(context.Context, string) ([]string, error) { return []string{"ed25519:other"}, nil }
	if code, out := post(t, s, signed(func(*api.PlaceOrderRequest) {})); code != 401 || out["code"] != "UNKNOWN_KEY" || p.subj != "" {
		t.Fatalf("%d %v", code, out)
	}
}

func TestCancelOwnership(t *testing.T) {
	s, p := newServer(t)
	s.OrderAt = func(context.Context, uint64) (*perpv1.Order, error) {
		return &perpv1.Order{Trader: trader, Market: 0, Size: 1e8}, nil
	}
	h := s.Handler(http.NotFoundHandler(), 0)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("DELETE", "/orders/42?trader=bob.testnet", nil))
	if w.Code != 403 || p.subj != "" {
		t.Fatalf("non-owner: %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("DELETE", "/orders/42?trader="+trader, nil))
	var c perpv1.Cancel
	if w.Code != 200 || p.subj != "engine.in.cancel.BTC" || proto.Unmarshal(p.data, &c) != nil || c.OrderId != 42 {
		t.Fatalf("owner: %d %s %s", w.Code, w.Body, p.subj)
	}
}

func TestClientIP(t *testing.T) {
	for _, c := range []struct{ remote, xff, want string }{
		{"172.18.0.5:1234", "9.9.9.9, 1.2.3.4", "1.2.3.4"}, // spoofed leftmost ignored
		{"127.0.0.1:1", "5.6.7.8", "5.6.7.8"},
		{"8.8.8.8:1", "1.2.3.4", "8.8.8.8"},
		{"172.18.0.5:1", "", "172.18.0.5"},
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("%+v: got %s", c, got)
		}
	}
}

func TestLimitExemptsInternal(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := limit(ok, 1)
	hit := func(remote, xff string) int {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = remote
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	for range 3 { // internal caller (mm-bot) never limited
		if c := hit("10.0.0.5:1", ""); c != http.StatusOK {
			t.Fatalf("internal limited: %d", c)
		}
	}
	hit("10.0.0.5:1", "1.2.3.4") // proxied client: limited per real IP
	if c := hit("10.0.0.5:1", "1.2.3.4"); c != http.StatusTooManyRequests {
		t.Fatalf("proxied client not limited: %d", c)
	}
	hit("8.8.8.8:1", "")
	if c := hit("8.8.8.8:1", ""); c != http.StatusTooManyRequests {
		t.Fatalf("public client not limited: %d", c)
	}
}
