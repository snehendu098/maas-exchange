package near

import (
	"crypto/ed25519"
	"fmt"
	"strings"

	"github.com/mr-tron/base58"
)

// ParsePrivateKey reads "ed25519:<base58>" (64-byte keypair or 32-byte seed).
func ParsePrivateKey(s string) (ed25519.PrivateKey, error) {
	b, err := decodeKey(s)
	if err != nil {
		return nil, err
	}
	switch len(b) {
	case ed25519.PrivateKeySize:
		return ed25519.PrivateKey(b), nil
	case ed25519.SeedSize:
		return ed25519.NewKeyFromSeed(b), nil
	}
	return nil, fmt.Errorf("near: private key len %d", len(b))
}

// ParsePublicKey reads "ed25519:<base58>" (32 bytes).
func ParsePublicKey(s string) (ed25519.PublicKey, error) {
	b, err := decodeKey(s)
	if err != nil {
		return nil, err
	}
	if len(b) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("near: public key len %d", len(b))
	}
	return ed25519.PublicKey(b), nil
}

// PublicKeyString formats pk as "ed25519:<base58>".
func PublicKeyString(pk ed25519.PublicKey) string { return "ed25519:" + base58.Encode(pk) }

func decodeKey(s string) ([]byte, error) {
	rest, ok := strings.CutPrefix(s, "ed25519:")
	if !ok {
		return nil, fmt.Errorf("near: key not ed25519: %q", trunc(s))
	}
	return base58.Decode(rest)
}

func trunc(s string) string { return s[:min(len(s), 12)] }
