package bus

import (
	"context"
	"errors"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Engine subjects/streams (engine owns them).
const (
	EngineInStream  = "ENGINE_IN"
	EngineInChain   = "engine.in.chain"
	EngineInSettle  = "engine.in.settle"
	EngineOutStream = "ENGINE_OUT"
	EngineOutBook   = "engine.out.book.>"
	EngineOutFill   = "engine.out.fill.>"
)

// EngineIn mirrors infra/nats/engine_in.stream.json (drift checked in bus_test).
var EngineIn = jetstream.StreamConfig{
	Name:              EngineInStream,
	Description:       "engine sequencer log: orders, cancels, chain updates, settle results",
	Subjects:          []string{"engine.in.>"},
	Retention:         jetstream.LimitsPolicy,
	Storage:           jetstream.FileStorage,
	Discard:           jetstream.DiscardOld,
	Replicas:          1,
	MaxConsumers:      -1,
	MaxMsgs:           -1,
	MaxBytes:          -1,
	MaxMsgsPerSubject: -1,
	Duplicates:        120 * time.Second,
	DenyDelete:        true,
}

// Connect dials NATS and creates ENGINE_IN only if missing; never overrides an existing config.
func Connect(ctx context.Context, url string) (*nats.Conn, jetstream.JetStream, error) {
	nc, err := nats.Connect(url)
	if err != nil {
		return nil, nil, err
	}
	js, err := jetstream.New(nc)
	if err == nil {
		_, err = js.CreateStream(ctx, EngineIn)
		if errors.Is(err, jetstream.ErrStreamNameAlreadyInUse) {
			err = nil
		}
	}
	if err != nil {
		nc.Close()
		return nil, nil, err
	}
	return nc, js, nil
}
