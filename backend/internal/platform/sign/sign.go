package sign

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/platform/near"
)

// Order mirrors the exchange Order (borsh field order = struct order, JSON = contract args).
type Order struct {
	Trader     string `json:"trader"`
	MarketID   uint32 `json:"market_id"`
	IsBuy      bool   `json:"is_buy"`
	Price      uint64 `json:"price,string"` // U128
	Size       uint64 `json:"size,string"`  // U128
	ReduceOnly bool   `json:"reduce_only"`
	Nonce      uint64 `json:"nonce"`
	ExpiryMs   uint64 `json:"expiry_ms"`
}

// Borsh encodes o exactly as the contract's borsh(Order).
func (o Order) Borsh() []byte {
	var b near.Borsh
	b.String(o.Trader)
	b.U32(o.MarketID)
	b.Bool(o.IsBuy)
	b.U128(o.Price)
	b.U128(o.Size)
	b.Bool(o.ReduceOnly)
	b.U64(o.Nonce)
	b.U64(o.ExpiryMs)
	return b.Bytes()
}

// Hash = sha256(borsh(o)) = exchange order_hash.
func (o Order) Hash() [32]byte { return sha256.Sum256(o.Borsh()) }

// FromProto lifts an engine order to the signed Order.
func FromProto(o *perpv1.Order) Order {
	return Order{o.Trader, o.Market, o.Side == perpv1.Side_SIDE_BUY, o.Price, o.Size, o.ReduceOnly, o.Nonce, o.ExpiryMs}
}

// SignOrder returns the order hash and a 64-byte ed25519 sig over it.
func SignOrder(o Order, key ed25519.PrivateKey) ([32]byte, []byte) {
	h := o.Hash()
	return h, ed25519.Sign(key, h[:])
}

var ErrBadSignature = errors.New("signature does not match trading key")

// Verify checks sig over hash by pub.
func Verify(pub ed25519.PublicKey, hash [32]byte, sig []byte) error {
	if len(pub) != ed25519.PublicKeySize || len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, hash[:], sig) {
		return ErrBadSignature
	}
	return nil
}
