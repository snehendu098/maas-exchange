package sign

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"testing"
)

// Shared vectors with the exchange contract order_hash.
func TestOrderHash(t *testing.T) {
	a := Order{"alice.testnet", 1, true, 3500000000, 100000000, false, 12345678901234, 1893456000000}
	wantBorsh := "0d000000616c6963652e746573746e6574010000000100c39dd000000000000000000000000000e1f50500000000000000000000000000f22fce733a0b000000b4c5dab8010000"
	if got := hex.EncodeToString(a.Borsh()); got != wantBorsh {
		t.Fatalf("borsh %s", got)
	}
	for _, v := range []struct {
		o    Order
		want string
	}{
		{a, "8751b7e16c0122cc4a8f33909e92f92fc880a2e16a79ea819e1c8ec8085d709a"},
		{Order{"bob.near", 0, false, 100000000000, 10000, true, 1, 1}, "2096498c110cff55f2eea690981d935fde5ca04249df8181698f40bb93926071"},
	} {
		h := v.o.Hash()
		if got := hex.EncodeToString(h[:]); got != v.want {
			t.Fatalf("hash %s want %s", got, v.want)
		}
	}
}

func TestSignVerify(t *testing.T) {
	key := ed25519.NewKeyFromSeed(make([]byte, 32))
	o := Order{Trader: "alice.testnet", Price: 1, Size: 1}
	h, sig := SignOrder(o, key)
	if err := Verify(key.Public().(ed25519.PublicKey), h, sig); err != nil {
		t.Fatal(err)
	}
	other := ed25519.NewKeyFromSeed(append(make([]byte, 31), 1))
	if Verify(other.Public().(ed25519.PublicKey), h, sig) == nil {
		t.Fatal("wrong key accepted")
	}
	o.Nonce = 1
	if Verify(key.Public().(ed25519.PublicKey), o.Hash(), sig) == nil {
		t.Fatal("tampered order accepted")
	}
}

func TestOrderJSON(t *testing.T) {
	b, _ := json.Marshal(Order{"a.near", 2, true, 5, 7, false, 9, 10})
	want := `{"trader":"a.near","market_id":2,"is_buy":true,"price":"5","size":"7","reduce_only":false,"nonce":9,"expiry_ms":10}`
	if string(b) != want {
		t.Fatalf("json %s", b)
	}
}
