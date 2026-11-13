package vaultkeeper

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Settings is vault-keeper env on top of platform config.
type Settings struct {
	Account    string // VK_ACCOUNT_ID: vault keeper role account
	Key        string // VK_PRIVATE_KEY: its full access key, sends keeper-only vault txs
	TradingKey string // VK_TRADING_KEY: signs vault orders (add_vault_trading_key), default VK_PRIVATE_KEY
	Gateway    string // VK_GATEWAY_URL
	AlertURL   string // VK_ALERT_WEBHOOK, optional
	Params
}

func LoadSettings() (Settings, error) {
	var errs []error
	d := func(k string, def time.Duration) time.Duration {
		v := os.Getenv(k)
		if v == "" {
			return def
		}
		x, err := time.ParseDuration(v)
		if err != nil || x <= 0 {
			errs = append(errs, fmt.Errorf("vaultkeeper: %s: want positive duration", k))
		}
		return x
	}
	n := func(k string, def int64) int64 {
		v := os.Getenv(k)
		if v == "" {
			return def
		}
		x, err := strconv.ParseInt(v, 10, 64)
		if err != nil || x < 0 {
			errs = append(errs, fmt.Errorf("vaultkeeper: %s: want int >= 0", k))
		}
		return x
	}
	s := Settings{
		Account: os.Getenv("VK_ACCOUNT_ID"), Key: os.Getenv("VK_PRIVATE_KEY"), AlertURL: os.Getenv("VK_ALERT_WEBHOOK"),
		Gateway: env("VK_GATEWAY_URL", "http://localhost:8080"),
		Params: Params{
			Policy: Policy{
				TolBps: n("VK_TOLERANCE_BPS", 100), SettleTimeout: d("VK_SETTLE_TIMEOUT", 30*time.Second),
				BackoffBase: d("VK_BACKOFF_BASE", 2*time.Second), BackoffMax: d("VK_BACKOFF_MAX", time.Minute),
				MaxUnhedged: d("VK_MAX_UNHEDGED", 5*time.Minute), HoldOff: d("VK_HOLD_OFF", 10*time.Minute),
			},
			Interval: d("VK_INTERVAL", 5*time.Second), BootGrace: d("VK_BOOT_GRACE", 10*time.Second),
			SlipBps: n("VK_SLIPPAGE_BPS", 50), OrderTTL: d("VK_ORDER_TTL", 2*time.Minute), MinMove: n("VK_MIN_MOVE", 10) * 1e6,
		},
	}
	s.TradingKey = env("VK_TRADING_KEY", s.Key)
	if s.Key == "" || s.Account == "" {
		errs = append(errs, errors.New("vaultkeeper: VK_ACCOUNT_ID and VK_PRIVATE_KEY required"))
	}
	if s.SlipBps >= 1e4 {
		errs = append(errs, errors.New("vaultkeeper: VK_SLIPPAGE_BPS must be < 10000"))
	}
	if s.MaxUnhedged <= s.SettleTimeout {
		errs = append(errs, errors.New("vaultkeeper: VK_MAX_UNHEDGED must exceed VK_SETTLE_TIMEOUT"))
	}
	return s, errors.Join(errs...)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
