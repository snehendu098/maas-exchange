package oracle

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

var defaultHTTP = &http.Client{Timeout: 5 * time.Second}

// Hermes is a minimal Pyth Hermes HTTP client.
type Hermes struct {
	BaseURL string
	APIKey  string            // sent as Bearer; Hermes 401s without it
	Feeds   map[uint32]string // market id -> feed id, required
	HTTP    *http.Client      // nil = 5s timeout client
}

type hermesResp struct {
	Parsed []struct {
		ID    string `json:"id"`
		Price struct {
			Price       string `json:"price"`
			Expo        int32  `json:"expo"`
			PublishTime int64  `json:"publish_time"`
		} `json:"price"`
	} `json:"parsed"`
}

// notEntitled matches Hermes' 403 body for feeds outside the API key's plan.
var notEntitled = regexp.MustCompile(`Not entitled: feed (?:0x)?([0-9a-fA-F]{64})`)

// Latest fetches latest prices for all feeds. Feeds the API key is not
// entitled to (403 "Not entitled: feed <id>") are dropped and listed in Snapshot.Missing
// instead of failing every market; any other error fails the call.
func (h *Hermes) Latest(ctx context.Context) (Snapshot, error) {
	active := maps.Clone(h.Feeds)
	var missing []uint32
	for len(active) > 0 {
		r, status, body, err := h.fetch(ctx, active)
		if err != nil {
			return Snapshot{}, err
		}
		if status == http.StatusOK {
			s, err := parseHermes(r, active)
			slices.Sort(missing)
			s.Missing = missing
			return s, err
		}
		m := notEntitled.FindStringSubmatch(body)
		if status != http.StatusForbidden || m == nil {
			return Snapshot{}, fmt.Errorf("hermes: status %d", status)
		}
		dropped := false
		for id, feed := range active {
			if strings.EqualFold(strings.TrimPrefix(feed, "0x"), m[1]) {
				delete(active, id)
				missing, dropped = append(missing, id), true
			}
		}
		if !dropped { // feed not ours: avoid looping forever
			return Snapshot{}, fmt.Errorf("hermes: status %d: %s", status, m[0])
		}
	}
	return Snapshot{}, fmt.Errorf("hermes: API key not entitled to any configured feed")
}

// fetch does one request; non-200 returns status + a short body, not an error.
func (h *Hermes) fetch(ctx context.Context, feeds map[uint32]string) (hermesResp, int, string, error) {
	q := url.Values{"parsed": {"true"}, "binary": {"false"}}
	for _, id := range feeds {
		q.Add("ids[]", id)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.BaseURL+"/v2/updates/price/latest?"+q.Encode(), nil)
	if err != nil {
		return hermesResp{}, 0, "", err
	}
	if h.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.APIKey)
	}
	c := h.HTTP
	if c == nil {
		c = defaultHTTP
	}
	res, err := c.Do(req)
	if err != nil {
		return hermesResp{}, 0, "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return hermesResp{}, res.StatusCode, string(b), nil
	}
	var r hermesResp
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&r); err != nil {
		return hermesResp{}, 0, "", fmt.Errorf("hermes: decode: %w", err)
	}
	return r, http.StatusOK, "", nil
}

func parseHermes(r hermesResp, feeds map[uint32]string) (Snapshot, error) {
	byID := map[string]uint32{}
	for m, id := range feeds {
		byID[strings.ToLower(strings.TrimPrefix(id, "0x"))] = m
	}
	s := Snapshot{Prices: map[uint32]int64{}, Published: map[uint32]time.Time{}}
	for _, p := range r.Parsed {
		m, ok := byID[strings.TrimPrefix(p.ID, "0x")]
		if !ok {
			continue
		}
		if p.Price.Expo < -18 || p.Price.Expo > 0 {
			return Snapshot{}, fmt.Errorf("hermes: expo %d out of range", p.Price.Expo)
		}
		v, err := strconv.ParseInt(p.Price.Price, 10, 64)
		if err != nil {
			return Snapshot{}, fmt.Errorf("hermes: price %q: %w", p.Price.Price, err)
		}
		if s.Prices[m], ok = ToE6(v, p.Price.Expo); !ok {
			return Snapshot{}, fmt.Errorf("hermes: price %d expo %d overflows", v, p.Price.Expo)
		}
		t := time.Unix(p.Price.PublishTime, 0)
		s.Published[m] = t
		if s.PublishTime.IsZero() || t.Before(s.PublishTime) {
			s.PublishTime = t
		}
	}
	return s, nil
}
