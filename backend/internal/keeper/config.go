package keeper

import (
	"errors"
	"fmt"
	"math/big"
	"os"
	"strconv"
	"time"

	"maas/backend/internal/platform/oracle"
)

// maxFundingRate mirrors exchange MAX_FUNDING_RATE; above it update_funding panics.
var maxFundingRate = big.NewInt(1e16)

// Settings is keeper-only env on top of platform config.
type Settings struct {
	Account      string        // KEEPER_ACCOUNT_ID, falls back to OPERATOR_ACCOUNT_ID
	Key          string        // KEEPER_PRIVATE_KEY, falls back to OPERATOR_PRIVATE_KEY
	OracleMode   string        // ORACLE_MODE mock|hermes, default hermes (hermes: oracle.HermesFromEnv)
	PushEvery    time.Duration // PRICE_PUSH_INTERVAL, default 10s (< exchange max_price_age_ms)
	MockPrices   []int64       // MOCK_PRICES via oracle.MockPricesE6 (USDC 1e6 per market id)
	FundingEvery time.Duration // FUNDING_INTERVAL, default 1h
	FundingCap   *big.Int      // FUNDING_CAP per period, 1e18 = 100%
	FundingBps   int64         // FUNDING_INTEREST_BPS_DAY base rate, default 3 (0.01%/8h)
	ScanEvery    time.Duration // SCAN_INTERVAL, default 2s
	PollEvery    time.Duration // PRICE_POLL_INTERVAL, default 2s
	TWAPWindow   time.Duration // TWAP_WINDOW, default 5m
}

// LoadSettings reads keeper env.
func LoadSettings() (Settings, error) {
	var errs []error
	s := Settings{
		Account:      firstEnv("KEEPER_ACCOUNT_ID", "OPERATOR_ACCOUNT_ID"),
		Key:          firstEnv("KEEPER_PRIVATE_KEY", "OPERATOR_PRIVATE_KEY"),
		PushEvery:    dur("PRICE_PUSH_INTERVAL", 10*time.Second, &errs),
		OracleMode:   env("ORACLE_MODE", "hermes"),
		FundingEvery: dur("FUNDING_INTERVAL", time.Hour, &errs),
		ScanEvery:    dur("SCAN_INTERVAL", 2*time.Second, &errs),
		PollEvery:    dur("PRICE_POLL_INTERVAL", 2*time.Second, &errs),
		TWAPWindow:   dur("TWAP_WINDOW", 5*time.Minute, &errs),
	}
	cap, ok := new(big.Int).SetString(env("FUNDING_CAP", "1000000000000000"), 10)
	if !ok || cap.Sign() < 0 || cap.Cmp(maxFundingRate) > 0 {
		errs = append(errs, errors.New("keeper: FUNDING_CAP must be an int in [0, 1e16]"))
	}
	s.FundingCap = cap
	bps, err := strconv.ParseInt(env("FUNDING_INTEREST_BPS_DAY", "3"), 10, 64)
	if err != nil || bps < -10_000 || bps > 10_000 {
		errs = append(errs, errors.New("keeper: FUNDING_INTEREST_BPS_DAY must be an int in [-10000, 10000]"))
	}
	s.FundingBps = bps
	mock, err := oracle.MockPricesE6()
	if err != nil {
		errs = append(errs, fmt.Errorf("keeper: %w", err))
	}
	s.MockPrices = mock
	if s.Key == "" || s.Account == "" {
		errs = append(errs, errors.New("keeper: KEEPER_ACCOUNT_ID/KEEPER_PRIVATE_KEY (or OPERATOR_*) required"))
	}
	if s.OracleMode != "mock" && s.OracleMode != "hermes" {
		errs = append(errs, fmt.Errorf("keeper: ORACLE_MODE %q not mock|hermes", s.OracleMode))
	}
	return s, errors.Join(errs...)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func firstEnv(keys ...string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func dur(k string, def time.Duration, errs *[]error) time.Duration {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		*errs = append(*errs, fmt.Errorf("keeper: %s: want positive duration like 5m", k))
		return def
	}
	return d
}
