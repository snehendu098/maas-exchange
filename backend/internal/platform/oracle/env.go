package oracle

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Source yields index prices.
type Source interface {
	Latest(ctx context.Context) (Snapshot, error)
}

// DefaultMockPrices is the single default for MOCK_PRICES (whole USD by market id, local dev only).
const DefaultMockPrices = "60000,3000,3"

// FromEnv builds the ORACLE_MODE source (default hermes): hermes uses
// HERMES_URL + HERMES_API_KEY; mock uses MOCK_PRICES (whole USD csv by market id).
func FromEnv(feeds map[uint32]string) (Source, error) {
	switch mode := getenv("ORACLE_MODE", "hermes"); mode {
	case "hermes":
		return HermesFromEnv(feeds), nil
	case "mock":
		px, err := MockPricesE6()
		if err != nil {
			return nil, err
		}
		prices := map[uint32]int64{}
		for i, p := range px {
			if _, ok := feeds[uint32(i)]; ok {
				prices[uint32(i)] = p
			}
		}
		return NewMock(prices), nil
	default:
		return nil, fmt.Errorf("oracle: ORACLE_MODE %q not mock|hermes", mode)
	}
}

// HermesFromEnv: HERMES_URL (default public Hermes) + HERMES_API_KEY.
func HermesFromEnv(feeds map[uint32]string) *Hermes {
	return &Hermes{BaseURL: getenv("HERMES_URL", "https://hermes.pyth.network"), APIKey: os.Getenv("HERMES_API_KEY"), Feeds: feeds}
}

// MockPricesE6 parses MOCK_PRICES (whole USD csv, index = market id) into USDC 1e6.
func MockPricesE6() ([]int64, error) {
	var out []int64
	for _, f := range strings.Split(getenv("MOCK_PRICES", DefaultMockPrices), ",") {
		usd, err := strconv.ParseInt(strings.TrimSpace(f), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("oracle: MOCK_PRICES: %w", err)
		}
		out = append(out, usd*1e6)
	}
	return out, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
