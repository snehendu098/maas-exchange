package near

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/mr-tron/base58"
)

func TestKeys(t *testing.T) {
	k := ed25519.NewKeyFromSeed(make([]byte, 32))
	for _, s := range []string{"ed25519:" + base58.Encode(k), "ed25519:" + base58.Encode(k.Seed())} {
		got, err := ParsePrivateKey(s)
		if err != nil || !got.Equal(k) {
			t.Fatalf("parse %v", err)
		}
	}
	pk := k.Public().(ed25519.PublicKey)
	if got, err := ParsePublicKey(PublicKeyString(pk)); err != nil || !got.Equal(pk) {
		t.Fatalf("pub %v", err)
	}
	if _, err := ParsePrivateKey("secp256k1:abc"); err == nil {
		t.Fatal("non-ed25519 accepted")
	}
}

func TestEncodeTx(t *testing.T) {
	k := ed25519.NewKeyFromSeed(make([]byte, 32))
	pk := k.Public().(ed25519.PublicKey)
	tx := EncodeTx("a.near", pk, 7, "b.near", [32]byte{9}, FunctionCall{"m", []byte("{}"), 5, big.NewInt(1)})
	want := "06000000612e6e656172" + "00" + hex.EncodeToString(pk) + "0700000000000000" + "06000000622e6e656172" +
		"09" + hex.EncodeToString(make([]byte, 31)) + "01000000" + "02" + "010000006d" + "020000007b7d" +
		"0500000000000000" + "01" + hex.EncodeToString(make([]byte, 15))
	if got := hex.EncodeToString(tx); got != want {
		t.Fatalf("tx\n%s\n%s", got, want)
	}
	raw, hash := SignTx(tx, k)
	h := sha256.Sum256(tx)
	if hash != base58.Encode(h[:]) || len(raw) != len(tx)+65 || !ed25519.Verify(pk, h[:], raw[len(tx)+1:]) {
		t.Fatal("signed tx")
	}
}
