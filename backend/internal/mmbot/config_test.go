package mmbot

import "testing"

func TestSimWallets(t *testing.T) {
	t.Setenv("MM_ACCOUNT_ID", "mm.testnet")
	t.Setenv("MM_PRIVATE_KEY", "ed25519:x")
	t.Setenv("SIM_WALLETS", " a.testnet=ed25519:k1, b.testnet=ed25519:k2 ,")
	s, err := LoadSettings()
	if err != nil || len(s.SimWallets) != 2 || s.SimWallets[1] != (SimWallet{"b.testnet", "ed25519:k2"}) {
		t.Fatalf("%v %+v", err, s.SimWallets)
	}
	t.Setenv("SIM_WALLETS", "nokey")
	if _, err := LoadSettings(); err == nil {
		t.Fatal("bad SIM_WALLETS accepted")
	}
}
