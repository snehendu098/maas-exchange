package ws

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/gateway/api"
	"maas/backend/internal/gateway/feed"
)

// subscribe -> delta -> disconnect (miss a delta) -> reconnect -> snapshot carries both levels.
func TestBookResync(t *testing.T) {
	f := feed.New(map[uint32]api.Market{0: {ID: 0, Symbol: "BTC"}})
	hub := &Hub{Snapshot: f.Snapshot}
	f.Publish = hub.Publish
	srv := httptest.NewServer(hub)
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	delta := func(seq, price uint64) {
		b, _ := proto.Marshal(&perpv1.EngineOutput{Event: &perpv1.EngineOutput_Book{
			Book: &perpv1.BookDelta{Market: 0, Side: perpv1.Side_SIDE_BUY, Price: price, Size: 5}}})
		f.OnOut(context.Background(), seq, time.Now(), b)
	}

	c := dial(t, url)
	if u := read(t, c); !u.Snapshot || u.Seq != 0 || len(u.Deltas) != 0 {
		t.Fatalf("first snapshot %+v", u)
	}
	delta(7, 100)
	if u := read(t, c); u.Snapshot || u.Seq != 7 || u.Deltas[0].Price != "100" {
		t.Fatalf("delta %+v", u)
	}
	c.Close()
	waitFor(t, func() bool { return !hub.Has("book:0") })
	delta(9, 200) // missed while offline

	c = dial(t, url)
	defer c.Close()
	u := read(t, c)
	if !u.Snapshot || u.Seq != 9 || len(u.Deltas) != 2 {
		t.Fatalf("resync snapshot %+v", u)
	}
	delta(10, 300)
	if u := read(t, c); u.Seq != 10 {
		t.Fatalf("post-resync delta %+v", u)
	}
}

func dial(t *testing.T, url string) *websocket.Conn {
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.WriteJSON(map[string]any{"op": "subscribe", "channel": "book", "market": 0})
	return c
}

func read(t *testing.T, c *websocket.Conn) api.BookUpdate {
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	var m struct {
		Key  string
		Data api.BookUpdate
	}
	_, b, err := c.ReadMessage()
	if err != nil || json.Unmarshal(b, &m) != nil || m.Key != "book:0" {
		t.Fatalf("read %s %v", b, err)
	}
	return m.Data
}

func waitFor(t *testing.T, ok func() bool) {
	for i := 0; i < 100 && !ok(); i++ {
		time.Sleep(20 * time.Millisecond)
	}
}
