package indexer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Block is the neardata.xyz subset the indexer reads.
type Block struct {
	Block struct {
		Header struct {
			Height    uint64 `json:"height"`
			Hash      string `json:"hash"`
			Timestamp uint64 `json:"timestamp"` // ns
		} `json:"header"`
	} `json:"block"`
	Shards []struct {
		Outcomes []Outcome `json:"receipt_execution_outcomes"`
	} `json:"shards"`
}

// Outcome is one executed receipt.
type Outcome struct {
	TxHash string `json:"tx_hash"`
	Exec   struct {
		Outcome struct {
			ExecutorID string          `json:"executor_id"`
			Logs       []string        `json:"logs"`
			Status     json.RawMessage `json:"status"`
		} `json:"outcome"`
	} `json:"execution_outcome"`
}

// Failed reports a receipt whose state changes were reverted (logs still present).
func (o Outcome) Failed() bool {
	var s map[string]json.RawMessage
	_ = json.Unmarshal(o.Exec.Outcome.Status, &s)
	_, ok := s["Failure"]
	return ok
}

func (b *Block) Height() uint64  { return b.Block.Header.Height }
func (b *Block) Time() time.Time { return time.Unix(0, int64(b.Block.Header.Timestamp)).UTC() }

// Fetcher reads final blocks from neardata.xyz.
// shortcut: no rpc fallback; add if neardata uptime becomes an issue.
type Fetcher struct {
	Base   string // e.g. https://testnet.neardata.xyz/v0
	APIKey string // fastnear key; free tier caps ~30 blocks/min
	HTTP   *http.Client
}

func NewFetcher(network, apiKey string) *Fetcher {
	return &Fetcher{Base: "https://" + network + ".neardata.xyz/v0", APIKey: apiKey, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

// Final returns the latest final block height.
func (f *Fetcher) Final(ctx context.Context) (uint64, error) {
	b, err := f.get(ctx, "/last_block/final")
	if err != nil {
		return 0, err
	}
	if b == nil {
		return 0, fmt.Errorf("no final block")
	}
	return b.Height(), nil
}

// Block returns block h, or nil if h was skipped by the chain.
func (f *Fetcher) Block(ctx context.Context, h uint64) (*Block, error) {
	return f.get(ctx, fmt.Sprintf("/block/%d", h))
}

func (f *Fetcher) get(ctx context.Context, path string) (*Block, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.Base+path, nil)
	if err != nil {
		return nil, err
	}
	if f.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+f.APIKey)
	}
	res, err := f.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("neardata %s: %d %.200s", path, res.StatusCode, body)
	}
	var b *Block // body "null" = skipped height
	if err := json.Unmarshal(body, &b); err != nil {
		return nil, fmt.Errorf("neardata %s: %w", path, err)
	}
	return b, nil
}
