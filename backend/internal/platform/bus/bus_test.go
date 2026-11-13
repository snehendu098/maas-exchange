package bus

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/nats-io/nats.go/jetstream"
)

func TestEngineInMatchesInfra(t *testing.T) {
	b, err := os.ReadFile("../../../../infra/nats/engine_in.stream.json")
	if os.IsNotExist(err) {
		t.Skip("infra json not present")
	}
	if err != nil {
		t.Fatal(err)
	}
	var want jetstream.StreamConfig
	if err := json.Unmarshal(b, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(EngineIn, want) {
		t.Fatalf("EngineIn drifted from infra json:\n go  %+v\n json %+v", EngineIn, want)
	}
}
