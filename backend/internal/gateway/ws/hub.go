package ws

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// Hub fans {key, data} frames to subscribed sockets.
// Protocol (client live.ts): in {op:"subscribe"|"unsubscribe", channel, market?, trader?}; out {key, data}.
type Hub struct {
	Snapshot func(key string) any // sent on subscribe when non-nil (book resync)

	mu   sync.Mutex
	subs map[string]map[*conn]bool
}

type conn struct {
	ws   *websocket.Conn
	send chan []byte
	dead bool // guarded by Hub.mu
}

// sendBuf: a slow socket past this is dropped; client reconnects and resyncs from snapshot.
const sendBuf = 1024

var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

type msg struct {
	Op      string `json:"op"`
	Channel string `json:"channel"`
	Market  *int   `json:"market"`
	Trader  string `json:"trader"`
}

// Key mirrors client subKey: ticker | user:<lower addr> | <channel>:<market>.
func (m msg) key() (string, bool) {
	switch {
	case m.Channel == "ticker":
		return "ticker", true
	case m.Channel == "user" && m.Trader != "":
		return "user:" + strings.ToLower(m.Trader), true
	case (m.Channel == "book" || m.Channel == "trades") && m.Market != nil:
		return fmt.Sprintf("%s:%d", m.Channel, *m.Market), true
	}
	return "", false
}

func frame(key string, data any) []byte {
	b, _ := json.Marshal(struct {
		Key  string `json:"key"`
		Data any    `json:"data"`
	}{key, data})
	return b
}

// Publish sends data to every subscriber of key, in call order.
func (h *Hub) Publish(key string, data any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.subs[key]) == 0 {
		return
	}
	b := frame(key, data)
	for c := range h.subs[key] {
		select {
		case c.send <- b:
		default:
			h.dropLocked(c)
		}
	}
}

// Has reports whether key has subscribers.
func (h *Hub) Has(key string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs[key]) > 0
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &conn{ws: ws, send: make(chan []byte, sendBuf)}
	go c.write()
	defer h.drop(c)
	for {
		var m msg
		if err := ws.ReadJSON(&m); err != nil {
			return
		}
		key, ok := m.key()
		if !ok {
			continue
		}
		switch m.Op {
		case "subscribe":
			h.subscribe(c, key)
		case "unsubscribe":
			h.mu.Lock()
			delete(h.subs[key], c)
			h.mu.Unlock()
		}
	}
}

// subscribe registers then queues the snapshot under one lock, so no delta slips between them.
func (h *Hub) subscribe(c *conn, key string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.dead {
		return
	}
	if h.subs == nil {
		h.subs = map[string]map[*conn]bool{}
	}
	if h.subs[key] == nil {
		h.subs[key] = map[*conn]bool{}
	}
	h.subs[key][c] = true
	if h.Snapshot != nil {
		if s := h.Snapshot(key); s != nil {
			select {
			case c.send <- frame(key, s):
			default:
				h.dropLocked(c)
			}
		}
	}
}

func (h *Hub) drop(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.dropLocked(c)
}

// dropLocked unsubscribes c everywhere and ends its writer (idempotent).
func (h *Hub) dropLocked(c *conn) {
	for _, s := range h.subs {
		delete(s, c)
	}
	if !c.dead {
		c.dead = true
		close(c.send)
	}
}

func (c *conn) write() {
	defer c.ws.Close()
	for b := range c.send {
		if err := c.ws.WriteMessage(websocket.TextMessage, b); err != nil {
			slog.Debug("ws: write", "err", err)
			return
		}
	}
}
