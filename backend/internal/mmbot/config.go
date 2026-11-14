package mmbot

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Settings is mm-bot env on top of platform config.
type Settings struct {
	Account   string        // MM_ACCOUNT_ID
	Key       string        // MM_PRIVATE_KEY "ed25519:..."; also the trading key
	Gateway   string        // MM_GATEWAY_URL
	Every     time.Duration // MM_INTERVAL: tick gap is random in [Every, 2*Every)
	RPS       float64       // MM_RPS, gateway write pace (gateway limits per IP)
	MinCollat float64       // MM_MIN_COLLATERAL USDC; deposit when below
	Deposit   float64       // MM_DEPOSIT USDC
	Params

	BasisMean float64       // MM_BASIS_MEAN_BPS: long-run premium (+ = funding mostly positive)
	BasisStd  float64       // MM_BASIS_BPS: std of simulated perp premium vs index (0 = off)
	BasisTau  time.Duration // MM_BASIS_TAU: premium mean-reversion time

	SimWallets  []SimWallet   // SIM_WALLETS: comma list of account=ed25519:key taker wallets
	SimEvery    time.Duration // SIM_INTERVAL: mean gap between sim taker orders
	SimNotional float64       // SIM_NOTIONAL USDC: mean taker order size
	SimMax      float64       // SIM_MAX_NOTIONAL USDC: per-wallet |position| before it only reduces
	SimDeposit  float64       // SIM_DEPOSIT USDC per sim wallet
}

// SimWallet is one taker account and its full access key.
type SimWallet struct{ Account, Key string }

func LoadSettings() (Settings, error) {
	var errs []error
	n := func(k string, def float64) float64 {
		v := os.Getenv(k)
		if v == "" {
			return def
		}
		f, err := strconv.ParseFloat(v, 64)
		if err != nil || f < 0 {
			errs = append(errs, fmt.Errorf("mmbot: %s: want number >= 0", k))
		}
		return f
	}
	s := Settings{
		Account: os.Getenv("MM_ACCOUNT_ID"), Key: os.Getenv("MM_PRIVATE_KEY"), Gateway: os.Getenv("MM_GATEWAY_URL"), Every: 50 * time.Millisecond,
		RPS: n("MM_RPS", 200), MinCollat: n("MM_MIN_COLLATERAL", 200_000) * 1e6, Deposit: n("MM_DEPOSIT", 500_000) * 1e6,
		Params: Params{
			Levels: int(n("MM_LEVELS", 15)), SpreadBps: n("MM_SPREAD_BPS", 2), StepBps: n("MM_STEP_BPS", 2),
			SkewBps: n("MM_SKEW_BPS", 5), ReplaceBps: n("MM_REPLACE_BPS", 2),
			LevelNotional: n("MM_LEVEL_NOTIONAL", 5000) * 1e6, MaxNotional: n("MM_MAX_NOTIONAL", 250_000) * 1e6,
			Jitter: min(1, n("MM_JITTER", 0.6)), DepthGrowth: n("MM_DEPTH_GROWTH", 0.2), Churn: int(n("MM_CHURN", 1)),
		},
		BasisStd:    n("MM_BASIS_BPS", 4),
		SimNotional: n("SIM_NOTIONAL", 1500) * 1e6, SimMax: n("SIM_MAX_NOTIONAL", 20_000) * 1e6, SimDeposit: n("SIM_DEPOSIT", 20_000) * 1e6,
	}
	for _, w := range strings.Split(os.Getenv("SIM_WALLETS"), ",") {
		if w = strings.TrimSpace(w); w == "" {
			continue
		}
		a, k, ok := strings.Cut(w, "=")
		if !ok {
			errs = append(errs, errors.New("mmbot: SIM_WALLETS: want account=ed25519:key"))
			continue
		}
		s.SimWallets = append(s.SimWallets, SimWallet{a, k})
	}
	dur := func(k string, def time.Duration) time.Duration {
		v := os.Getenv(k)
		if v == "" {
			return def
		}
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			errs = append(errs, fmt.Errorf("mmbot: %s: want positive duration", k))
		}
		return d
	}
	s.BasisTau = dur("MM_BASIS_TAU", 30*time.Minute)
	s.BasisMean = 4 // n() rejects negatives; mean may be signed
	if v := os.Getenv("MM_BASIS_MEAN_BPS"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			errs = append(errs, errors.New("mmbot: MM_BASIS_MEAN_BPS: want number"))
		}
		s.BasisMean = f
	}
	s.SimEvery = dur("SIM_INTERVAL", time.Second)
	if s.Gateway == "" {
		s.Gateway = "http://localhost:8080"
	}
	if v := os.Getenv("MM_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			errs = append(errs, errors.New("mmbot: MM_INTERVAL: want positive duration"))
		}
		s.Every = d
	}
	if s.Key == "" || s.Account == "" {
		errs = append(errs, errors.New("mmbot: MM_ACCOUNT_ID and MM_PRIVATE_KEY required"))
	}
	if s.SpreadBps == 0 || s.RPS == 0 || s.MaxNotional == 0 || s.LevelNotional == 0 {
		errs = append(errs, errors.New("mmbot: MM_SPREAD_BPS, MM_RPS, MM_LEVEL_NOTIONAL, MM_MAX_NOTIONAL must be > 0"))
	}
	return s, errors.Join(errs...)
}
