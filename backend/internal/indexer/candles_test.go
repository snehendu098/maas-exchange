package indexer

import (
	"testing"
	"time"
)

func TestBuckets(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 10, 7, 30, 0, time.UTC)
	got := buckets([]fillTime{{1, t0}, {1, t0.Add(10 * time.Second)}, {1, t0.Add(time.Minute)}, {2, t0}})
	want := []bucket{
		{1, "1m", t0.Truncate(time.Minute)}, {1, "1m", t0.Truncate(time.Minute).Add(time.Minute)},
		{2, "1m", t0.Truncate(time.Minute)},
		{1, "5m", time.Date(2026, 1, 1, 10, 5, 0, 0, time.UTC)}, {2, "5m", time.Date(2026, 1, 1, 10, 5, 0, 0, time.UTC)},
		{1, "1h", time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)}, {2, "1h", time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d buckets %v, want %d", len(got), got, len(want))
	}
	for _, b := range want {
		if !got[b] {
			t.Errorf("missing %v", b)
		}
	}
}
