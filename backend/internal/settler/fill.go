package settler

import (
	"crypto/ed25519"
	"encoding/base64"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
)

// Fill is the exchange `settle` fill arg.
type Fill struct {
	Maker    sign.Order `json:"maker"`
	Taker    sign.Order `json:"taker"`
	MakerKey string     `json:"maker_key"`
	MakerSig string     `json:"maker_sig"` // base64
	TakerKey string     `json:"taker_key"`
	TakerSig string     `json:"taker_sig"`
	Price    uint64     `json:"price,string"`
	Size     uint64     `json:"size,string"`
}

// toFill maps an engine fill + both signed orders to the contract struct.
func toFill(f *perpv1.Fill, maker, taker *perpv1.Order) Fill {
	return Fill{
		Maker: sign.FromProto(maker), Taker: sign.FromProto(taker),
		MakerKey: near.PublicKeyString(ed25519.PublicKey(maker.PublicKey)), MakerSig: base64.StdEncoding.EncodeToString(maker.Signature),
		TakerKey: near.PublicKeyString(ed25519.PublicKey(taker.PublicKey)), TakerSig: base64.StdEncoding.EncodeToString(taker.Signature),
		Price: f.Price, Size: f.Size,
	}
}

func refOf(f *perpv1.Fill) ref { return ref{f.Market, f.TradeId} }

// fresh drops fills already in the db and in-batch redeliveries; keeps order.
func fresh(fills []*perpv1.Fill, known map[ref]bool) []*perpv1.Fill {
	seen := map[ref]bool{}
	var out []*perpv1.Fill
	for _, f := range fills {
		if r := refOf(f); !known[r] && !seen[r] {
			seen[r] = true
			out = append(out, f)
		}
	}
	return out
}

// bisect sends chunks for real (each ok chunk is final onchain), halving on failure.
// try: ok=false on tx failure, err on transport failure.
func bisect[T any](items []T, try func([]T) (bool, error)) (bad []T, err error) {
	if len(items) == 0 {
		return nil, nil
	}
	ok, err := try(items)
	switch {
	case err != nil || ok:
		return nil, err
	case len(items) == 1:
		return items, nil
	}
	b1, err := bisect(items[:len(items)/2], try)
	if err != nil {
		return b1, err
	}
	b2, err := bisect(items[len(items)/2:], try)
	return append(b1, b2...), err
}
