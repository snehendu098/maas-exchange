package bus

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
)

// EngineInOrder prefixes engine.in.order.<SYMBOL>.
const EngineInOrder = "engine.in.order."

// ErrNotOrder: the seq holds a non-order input (cancel, chain, settle).
var ErrNotOrder = errors.New("bus: not an order")

// OrderAt loads the Order at ENGINE_IN seq (= engine order id).
func OrderAt(ctx context.Context, js jetstream.JetStream, seq uint64) (*perpv1.Order, error) {
	s, err := js.Stream(ctx, EngineInStream)
	if err != nil {
		return nil, err
	}
	m, err := s.GetMsg(ctx, seq)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(m.Subject, EngineInOrder) {
		return nil, fmt.Errorf("%w: seq %d is %s", ErrNotOrder, seq, m.Subject)
	}
	var o perpv1.Order
	if err := proto.Unmarshal(m.Data, &o); err != nil {
		return nil, fmt.Errorf("bus: seq %d: %w", seq, err)
	}
	return &o, nil
}
