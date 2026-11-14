package oracle

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestHermesLatest(t *testing.T) {
	fixture, err := os.ReadFile("testdata/hermes_latest.json")
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer k" || len(r.URL.Query()["ids[]"]) != 4 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Write(fixture)
	}))
	defer srv.Close()

	s, err := (&Hermes{BaseURL: srv.URL, APIKey: "k", Feeds: feeds}).Latest(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if s.Prices[0] != 61500123456 || s.Prices[3] != 45123456 || len(s.Prices) != 2 {
		t.Fatalf("prices %v", s.Prices)
	}
	if !s.Published[3].Equal(time.Unix(1730000000, 0)) {
		t.Fatalf("published %v", s.Published)
	}

	if !s.PublishTime.Equal(time.Unix(1730000000, 0)) {
		t.Fatalf("publish time %v", s.PublishTime)
	}
	if _, err := (&Hermes{BaseURL: srv.URL, Feeds: feeds}).Latest(context.Background()); err == nil {
		t.Fatal("want 401 error")
	}
}

// Hermes 403s the whole request if any feed is outside the key's plan; client drops it and retries.
func TestHermesDropsUnentitledFeed(t *testing.T) {
	fixture, err := os.ReadFile("testdata/hermes_latest.json")
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		for _, id := range r.URL.Query()["ids[]"] {
			if id == feeds[1] {
				http.Error(w, "Not entitled: feed "+strings.TrimPrefix(feeds[1], "0x"), http.StatusForbidden)
				return
			}
		}
		w.Write(fixture)
	}))
	defer srv.Close()

	s, err := (&Hermes{BaseURL: srv.URL, Feeds: feeds}).Latest(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || len(s.Missing) != 1 || s.Missing[0] != 1 || s.Prices[0] != 61500123456 {
		t.Fatalf("calls=%d missing=%v prices=%v", calls, s.Missing, s.Prices)
	}

	// 403 without an entitlement message is still a hard error
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	defer bad.Close()
	if _, err := (&Hermes{BaseURL: bad.URL, Feeds: feeds}).Latest(context.Background()); err == nil {
		t.Fatal("want error on plain 403")
	}
}

func TestToE6(t *testing.T) {
	for _, c := range []struct {
		p    int64
		e    int32
		want int64
	}{{6150012345678, -8, 61500123456}, {5, -5, 50}, {7, -6, 7}} {
		if got, ok := ToE6(c.p, c.e); !ok || got != c.want {
			t.Errorf("ToE6(%d,%d)=%d want %d", c.p, c.e, got, c.want)
		}
	}
	if _, ok := ToE6(math.MaxInt64/100, 0); ok {
		t.Error("overflow not caught")
	}
}

var feeds = map[uint32]string{
	0: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
	1: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
	2: "4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b",
	3: "0xbe9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24",
}

func TestHermesBadExpo(t *testing.T) {
	var r hermesResp
	if err := json.Unmarshal([]byte(`{"parsed":[{"id":"`+feeds[0]+`","price":{"price":"1","expo":5}}]}`), &r); err != nil {
		t.Fatal(err)
	}
	if _, err := parseHermes(r, feeds); err == nil {
		t.Fatal("want expo error")
	}
}

func TestMock(t *testing.T) {
	m := NewMock(map[uint32]int64{0: 5e6})
	m.Set(0, 7e6)
	s, _ := m.Latest(context.Background())
	if s.Prices[0] != 7e6 || time.Since(s.Published[0]) > time.Minute {
		t.Fatalf("mock %+v", s)
	}
}
