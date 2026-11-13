// Package gwclient is a tiny JSON client for the gateway HTTP API (see gateway/api).
package gwclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"maas/backend/internal/gateway/api"
)

type Client struct {
	Base string
	HTTP *http.Client
}

// Do sends in as JSON and decodes into out (nil = discard). Non-2xx -> api.Error code/message.
func (c Client) Do(ctx context.Context, method, path string, in, out any) error {
	var body bytes.Buffer
	if in != nil {
		if err := json.NewEncoder(&body).Encode(in); err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.Base+path, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		var e api.Error
		json.NewDecoder(res.Body).Decode(&e)
		return fmt.Errorf("%s %s: %d %s %s", method, path, res.StatusCode, e.Code, e.Message)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// Markets is GET /markets with Tick/Lot parsed.
func (c Client) Markets(ctx context.Context) ([]api.Market, error) {
	var ms []api.Market
	if err := c.Do(ctx, "GET", "/markets", nil, &ms); err != nil {
		return nil, err
	}
	for i, m := range ms { // Tick/Lot are json:"-"
		ms[i].Tick, _ = strconv.ParseUint(m.TickSize, 10, 64)
		ms[i].Lot, _ = strconv.ParseUint(m.LotSize, 10, 64)
		if ms[i].Tick == 0 || ms[i].Lot == 0 {
			return nil, fmt.Errorf("gwclient: market %s bad tick/lot", m.Symbol)
		}
	}
	return ms, nil
}
