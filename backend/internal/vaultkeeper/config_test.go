package vaultkeeper

import (
	"testing"
	"time"
)

func TestLoadSettings(t *testing.T) {
	t.Setenv("VK_PRIVATE_KEY", "ed25519:k")
	t.Setenv("VK_ACCOUNT_ID", "keeper.testnet")
	t.Setenv("VK_MAX_UNHEDGED", "90s")
	s, err := LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if s.MaxUnhedged != 90*time.Second || s.TolBps != 100 || s.MinMove != 10e6 || s.TradingKey != "ed25519:k" {
		t.Fatalf("%+v", s)
	}
	t.Setenv("VK_MAX_UNHEDGED", "10s") // below settle timeout
	t.Setenv("VK_SLIPPAGE_BPS", "x")
	t.Setenv("VK_ACCOUNT_ID", "")
	if _, err := LoadSettings(); err == nil {
		t.Fatal("want errors")
	}
}
