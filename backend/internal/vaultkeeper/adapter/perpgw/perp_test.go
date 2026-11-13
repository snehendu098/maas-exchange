package perpgw

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"maas/backend/internal/gateway/api"
	"maas/backend/internal/platform/gwclient"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
	vk "maas/backend/internal/vaultkeeper"
)

func TestPlaceSignsForVault(t *testing.T) {
	key := ed25519.NewKeyFromSeed(make([]byte, 32))
	var got api.PlaceOrderRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		json.NewEncoder(w).Encode(api.OrderStatus{OrderID: "7", State: "ORDER_STATE_ACCEPTED"})
	}))
	defer srv.Close()
	p := &Perp{GW: gwclient.Client{Base: srv.URL, HTTP: srv.Client()}, Vault: "vault.testnet", Key: key}
	o := vk.Order{Market: 1, Buy: true, ReduceOnly: true, Size: 100_000, Price: 3_517_500_000, Nonce: 42, ExpiryMs: 2e12}
	if err := p.Place(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	if got.Trader != "vault.testnet" || got.Tif != "TIME_IN_FORCE_IOC" || !got.ReduceOnly || got.ExpiryMs != "2000000000000" {
		t.Fatalf("bad request %+v", got)
	}
	h := sign.Order{Trader: "vault.testnet", MarketID: 1, IsBuy: true, Price: 3_517_500_000, Size: 100_000, ReduceOnly: true,
		Nonce: 42, ExpiryMs: 2e12}.Hash()
	if got.OrderHash != hex.EncodeToString(h[:]) {
		t.Fatal("hash mismatch")
	}
	sig, _ := base64.StdEncoding.DecodeString(got.Signature)
	pub, err := near.ParsePublicKey(got.PublicKey)
	if err != nil || !pub.Equal(key.Public()) || sign.Verify(pub, h, sig) != nil {
		t.Fatal("sig not by vault trading key")
	}
}
