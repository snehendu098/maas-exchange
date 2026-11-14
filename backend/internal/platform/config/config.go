package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Market is one perp market entry in markets.json.
type Market struct {
	ID     uint32 `json:"id"`
	Symbol string `json:"symbol"`
	FeedID string `json:"feedId"` // pyth price feed id, 0x hex
}

// Config is shared service config from env (+ MARKETS_CONFIG json).
type Config struct {
	Network     string // testnet | mainnet
	RPCURL      string
	NATSURL     string
	DatabaseURL string

	Exchange string // EXCHANGE_CONTRACT
	Vault    string // VAULT_CONTRACT
	USDC     string // USDC_CONTRACT

	OperatorAccount string
	OperatorKey     string // "ed25519:<base58>"
	Markets         []Market

	StartBlock uint64        // INDEXER_START_BLOCK
	Poll       time.Duration // INDEXER_POLL_MS, default 1000
}

// Load reads env plus MARKETS_CONFIG (default config/markets.json).
func Load() (Config, error) {
	var errs []error
	ms, err := loadMarkets(env("MARKETS_CONFIG", "config/markets.json"))
	if err != nil {
		errs = append(errs, err)
	}
	net := env("NEAR_NETWORK", "testnet")
	c := Config{
		Network:         net,
		RPCURL:          env("NEAR_RPC_URL", "https://rpc."+net+".near.org"),
		NATSURL:         env("NATS_URL", "nats://localhost:4222"),
		DatabaseURL:     env("DATABASE_URL", "postgres://perp:perp@localhost:5432/perp"),
		Exchange:        os.Getenv("EXCHANGE_CONTRACT"),
		Vault:           os.Getenv("VAULT_CONTRACT"),
		USDC:            os.Getenv("USDC_CONTRACT"),
		OperatorAccount: os.Getenv("OPERATOR_ACCOUNT_ID"),
		OperatorKey:     os.Getenv("OPERATOR_PRIVATE_KEY"),
		Markets:         ms,
	}
	c.StartBlock = envUint("INDEXER_START_BLOCK", 0, &errs)
	c.Poll = time.Duration(envUint("INDEXER_POLL_MS", 1000, &errs)) * time.Millisecond
	if c.Exchange == "" {
		errs = append(errs, errors.New("config: EXCHANGE_CONTRACT unset"))
	}
	return c, errors.Join(errs...)
}

func loadMarkets(path string) ([]Market, error) {
	var f struct {
		Markets []Market `json:"markets"`
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("config: %s: %w", path, err)
	}
	return f.Markets, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envUint(k string, def uint64, errs *[]error) uint64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.ParseUint(v, 10, 64)
	if err != nil {
		*errs = append(*errs, fmt.Errorf("config: %s: %w", k, err))
	}
	return n
}
