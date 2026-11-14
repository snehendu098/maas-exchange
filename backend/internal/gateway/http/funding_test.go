package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/store"
	"maas/backend/internal/platform/db"
)

func get(s *Server, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.Handler(http.NotFoundHandler(), 0).ServeHTTP(w, httptest.NewRequest("GET", path, nil))
	return w
}

func TestFundingRatesBadInput(t *testing.T) {
	s, _ := newServer(t)
	for path, code := range map[string]int{"/funding/9": 404, "/funding/0?window=x": 400, "/funding/0?window=-1h": 400, "/funding/0?window=200h": 400} {
		if w := get(s, path); w.Code != code {
			t.Errorf("%s: %d %s", path, w.Code, w.Body)
		}
	}
}

// Needs postgres (DATABASE_URL or local perp); skips otherwise.
func TestFundingRatesWindow(t *testing.T) {
	ctx := context.Background()
	base := os.Getenv("DATABASE_URL")
	if base == "" {
		base = "postgres://perp:perp@localhost:5432/perp"
	}
	c, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Skip("postgres down: ", err)
	}
	for _, q := range []string{"DROP DATABASE IF EXISTS perp_gw_http_test WITH (FORCE)", "CREATE DATABASE perp_gw_http_test"} {
		if _, err := c.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	c.Close(ctx)
	u, _ := url.Parse(base)
	u.Path = "/perp_gw_http_test"
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	// market 0: one print outside 3h, two inside; market 1 noise
	for _, r := range [][]any{{10, 0, 0, "5", now.Add(-4 * 3600e9)}, {11, 1, 0, "-3", now.Add(-2 * 3600e9)}, {12, 0, 0, "-4", now.Add(-3600e9)}, {12, 1, 1, "9", now}} {
		if _, err := pool.Exec(ctx, `INSERT INTO funding_updates VALUES ($1,$2,$3,$4,0,0,$5)`, r...); err != nil {
			t.Fatal(err)
		}
	}
	s, _ := newServer(t)
	s.Store = &store.Store{Pool: pool}
	w := get(s, "/funding/0?window=3h")
	var got []api.FundingRate
	json.Unmarshal(w.Body.Bytes(), &got)
	want := []api.FundingRate{{Time: now.Unix() - 7200, Rate: "-3", Block: 11, LogIndex: 1}, {Time: now.Unix() - 3600, Rate: "-4", Block: 12}}
	if w.Code != 200 || len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("%d %+v", w.Code, got)
	}
}
