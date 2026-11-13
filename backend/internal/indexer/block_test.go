package indexer

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetcher(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer k" {
			t.Errorf("missing auth header")
		}
		switch r.URL.Path {
		case "/last_block/final", "/block/100":
			http.ServeFile(w, r, "testdata/block.json")
		case "/block/101":
			w.Write([]byte("null"))
		default:
			http.Error(w, `{"error":"too far"}`, http.StatusNotFound)
		}
	}))
	defer srv.Close()
	f := &Fetcher{Base: srv.URL, APIKey: "k", HTTP: srv.Client()}
	ctx := context.Background()
	if h, err := f.Final(ctx); err != nil || h != 100 {
		t.Fatalf("final = %d, %v", h, err)
	}
	b, err := f.Block(ctx, 100)
	if err != nil || len(b.Shards) != 2 || !b.Shards[1].Outcomes[0].Failed() || b.Shards[0].Outcomes[0].Failed() {
		t.Fatalf("block 100 = %+v, %v", b, err)
	}
	if b, err := f.Block(ctx, 101); err != nil || b != nil {
		t.Fatalf("skipped block = %v, %v", b, err)
	}
	if _, err := f.Block(ctx, 102); err == nil {
		t.Fatal("want error on 404")
	}
}
