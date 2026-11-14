package http

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/store"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/sign"
)

// place validates a signed order, publishes it to engine.in.order.<SYM>; order id = ack seq.
func (s *Server) place(w http.ResponseWriter, r *http.Request) {
	var req api.PlaceOrderRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		reply(w, nil, fail(400, "BAD_REQUEST", "invalid json"))
		return
	}
	o, sym, e := s.validate(r, &req)
	if e != nil {
		reply(w, nil, e)
		return
	}
	b, _ := proto.Marshal(o)
	// msg id = order hash: resubmits inside the stream dedupe window get the same seq
	ack, err := s.JS.Publish(r.Context(), bus.EngineInOrder+sym, b, jetstream.WithMsgID(req.OrderHash))
	if err != nil {
		reply(w, nil, fail(http.StatusBadGateway, "BUS_UNAVAILABLE", err.Error()))
		return
	}
	reply(w, api.OrderStatus{
		Market: o.Market, OrderID: strconv.FormatUint(ack.Sequence, 10), Trader: req.Trader,
		State: "ORDER_STATE_ACCEPTED", Reason: "REASON_UNSPECIFIED", Filled: "0", Remaining: req.Size,
	}, nil)
}

func (s *Server) validate(r *http.Request, req *api.PlaceOrderRequest) (*perpv1.Order, string, *apiErr) {
	side, okS := perpv1.Side_value[req.Side]
	typ, okT := perpv1.OrderType_value[req.Type]
	tif, okF := perpv1.TimeInForce_value[req.Tif]
	if !okS || !okT || !okF || side == 0 || typ == 0 || tif == 0 {
		return nil, "", fail(400, "BAD_REQUEST", "side/type/tif must be SIDE_*/ORDER_TYPE_*/TIME_IN_FORCE_*")
	}
	if !near.ValidAccountID(req.Trader) {
		return nil, "", fail(400, "BAD_REQUEST", "trader must be a NEAR account id")
	}
	m, ok := s.Feed.Markets[req.Market]
	if !ok {
		return nil, "", fail(400, "UNKNOWN_MARKET", "unknown market "+strconv.Itoa(int(req.Market)))
	}
	var price, size, nonce, expiry uint64
	for _, f := range []struct {
		v   string
		dst *uint64
	}{{req.Price, &price}, {req.Size, &size}, {req.Nonce, &nonce}, {req.ExpiryMs, &expiry}} {
		n, err := strconv.ParseUint(f.v, 10, 64)
		if err != nil && f.v != "" {
			return nil, "", fail(400, "BAD_REQUEST", "price/size/nonce/expiryMs must be uint64 decimal strings")
		}
		*f.dst = n
	}
	switch {
	case size == 0:
		return nil, "", fail(400, "ZERO_SIZE", "size must be > 0")
	case size%m.Lot != 0:
		return nil, "", fail(400, "INVALID_LOT", "size not a multiple of lot "+m.LotSize)
	case price == 0 && typ == int32(perpv1.OrderType_ORDER_TYPE_MARKET):
		return nil, "", fail(400, "MISSING_PRICE", "market order needs a signed worst-price guard (price != 0)")
	case price == 0:
		return nil, "", fail(400, "MISSING_PRICE", "limit order needs a price")
	case price%m.Tick != 0:
		return nil, "", fail(400, "INVALID_TICK", "price not a multiple of tick "+m.TickSize)
	case nonce == 0:
		return nil, "", fail(400, "MISSING_NONCE", "nonce required")
	case expiry <= uint64(s.Now().UnixMilli()):
		return nil, "", fail(400, "EXPIRED", "order expired")
	}
	idx, ok := s.Feed.Index(m.ID)
	if !ok || idx == 0 {
		return nil, "", fail(http.StatusServiceUnavailable, "MISSING_MARK", "no oracle index yet")
	}
	if diff := max(price, idx) - min(price, idx); diff > idx/10_000*s.BandBps {
		return nil, "", fail(400, "PRICE_BAND", "price outside "+strconv.FormatUint(s.BandBps, 10)+" bps of index")
	}
	so := sign.Order{Trader: req.Trader, MarketID: m.ID, IsBuy: side == int32(perpv1.Side_SIDE_BUY), Price: price,
		Size: size, ReduceOnly: req.ReduceOnly, Nonce: nonce, ExpiryMs: expiry}
	hash := so.Hash()
	if !strings.EqualFold(strings.TrimPrefix(req.OrderHash, "0x"), hex.EncodeToString(hash[:])) {
		return nil, "", fail(400, "BAD_ORDER_HASH", "orderHash does not match payload")
	}
	pub, err := near.ParsePublicKey(req.PublicKey)
	if err != nil {
		return nil, "", fail(400, "BAD_REQUEST", "publicKey must be ed25519:<base58>")
	}
	sig, err := base64.StdEncoding.DecodeString(req.Signature)
	if err != nil || sign.Verify(pub, hash, sig) != nil {
		return nil, "", fail(http.StatusUnauthorized, "BAD_SIGNATURE", "signature does not match publicKey")
	}
	keys, err := s.Keys(r.Context(), req.Trader)
	if err != nil {
		return nil, "", fail(http.StatusBadGateway, "CHAIN_UNAVAILABLE", err.Error())
	}
	if !slices.Contains(keys, near.PublicKeyString(pub)) {
		return nil, "", fail(http.StatusUnauthorized, "UNKNOWN_KEY", "publicKey is not a trading key of trader")
	}
	return &perpv1.Order{
		Trader: req.Trader, Market: m.ID, Side: perpv1.Side(side), Type: perpv1.OrderType(typ), Tif: perpv1.TimeInForce(tif),
		Price: price, Size: size, ReduceOnly: req.ReduceOnly, Nonce: nonce, ExpiryMs: expiry, ClientId: req.ClientID,
		OrderHash: hash[:], Signature: sig, PublicKey: near.PublicKeyString(pub),
	}, m.Symbol, nil
}

// cancel checks ownership against the ENGINE_IN order, then publishes Cancel.
// shortcut: unsigned, client sends only ?trader=; add a signed cancel before mainnet.
func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseUint(r.PathValue("id"), 10, 64)
	trader := store.AccountID(r.URL.Query().Get("trader"))
	if err != nil || trader == "" {
		reply(w, nil, fail(400, "BAD_REQUEST", "need numeric order id and ?trader=<account id>"))
		return
	}
	in, err := s.OrderAt(r.Context(), id)
	if errors.Is(err, jetstream.ErrMsgNotFound) || errors.Is(err, bus.ErrNotOrder) {
		reply(w, nil, fail(404, "UNKNOWN_ORDER", "order "+r.PathValue("id")+" not found"))
		return
	}
	if err != nil {
		reply(w, nil, fail(http.StatusBadGateway, "BUS_UNAVAILABLE", err.Error()))
		return
	}
	if in.Trader != trader {
		reply(w, nil, fail(403, "NOT_OWNER", "not your order"))
		return
	}
	st := api.OrderStatus{Market: in.Market, OrderID: r.PathValue("id"), Trader: trader, State: "ORDER_STATE_ACCEPTED",
		Reason: "REASON_UNSPECIFIED", Filled: "0", Remaining: strconv.FormatUint(in.Size, 10)}
	if o, ok := s.Feed.Order(id); ok {
		st = o.Status()
		if !o.Open() {
			st.State = "ORDER_STATE_CANCEL_REJECTED"
			reply(w, st, nil)
			return
		}
	}
	b, _ := proto.Marshal(&perpv1.Cancel{Trader: in.Trader, Market: in.Market, OrderId: id})
	if _, err := s.JS.Publish(r.Context(), "engine.in.cancel."+s.Feed.Markets[in.Market].Symbol, b); err != nil {
		reply(w, nil, fail(http.StatusBadGateway, "BUS_UNAVAILABLE", err.Error()))
		return
	}
	reply(w, st, nil) // final CANCELLED arrives on user:<trader>
}
