package vaultkeeper_test

import (
	"context"
	"testing"
	"time"

	vk "maas/backend/internal/vaultkeeper"
	"maas/backend/internal/vaultkeeper/fake"
	"maas/backend/internal/vaultkeeper/sizing"
)

const BTC, ETH, HYPE = 0, 1, 2

var specs = []vk.Spec{
	{ID: BTC, Symbol: "BTC", Lot: 10_000, Tick: 100_000},
	{ID: ETH, Symbol: "ETH", Lot: 100_000, Tick: 10_000},
	{ID: HYPE, Symbol: "HYPE", Lot: 1_000_000, Tick: 1000},
}

var params = vk.Params{
	Policy: vk.Policy{TolBps: 100, SettleTimeout: 10 * time.Second, BackoffBase: time.Second, BackoffMax: 8 * time.Second,
		MaxUnhedged: time.Minute, HoldOff: 5 * time.Minute},
	Interval: time.Second, SlipBps: 50, OrderTTL: 2 * time.Minute, MinMove: 10e6,
}

type world struct {
	t      *testing.T
	clock  *fake.Clock
	perp   *fake.Perp
	vault  *fake.Vault
	alerts *fake.Alerts
	k      *vk.Keeper
	loose  bool // skip naked-short check (test made it externally)
}

func newWorld(t *testing.T, idle int64) *world {
	c := fake.NewClock(time.Unix(1_700_000_000, 0))
	p := fake.NewPerp(c, specs, map[uint32]int64{BTC: 100_000e6, ETH: 3_500e6, HYPE: 40e6})
	p.SettleDelay = 2 * time.Second
	cfg := vk.Config{Weights: map[uint32]int64{BTC: 4000, ETH: 3000, HYPE: 3000}, ShortLevBps: 10_000, IdleBufferBps: 500}
	w := &world{t: t, clock: c, perp: p, vault: fake.NewVault(p, cfg, idle), alerts: &fake.Alerts{}}
	w.k = w.keeper()
	return w
}

func (w *world) keeper() *vk.Keeper {
	k := &vk.Keeper{Vault: w.vault, Perp: w.perp, Clock: w.clock, Alerts: w.alerts, P: params}
	if err := k.Init(context.Background()); err != nil {
		w.t.Fatal(err)
	}
	return k
}

// run ticks n seconds, checking no naked short ever exists on chain.
func (w *world) run(n int) {
	w.t.Helper()
	for range n {
		w.k.Tick(context.Background())
		w.clock.Advance(time.Second)
		for _, s := range specs {
			if pos, _ := w.perp.Position(context.Background(), s.ID); -pos > w.vault.Spot(s.ID) && !w.loose {
				w.t.Fatalf("naked short on %s: short %d spot %d", s.Symbol, -pos, w.vault.Spot(s.ID))
			}
		}
	}
}

func (w *world) pos(id uint32) int64 {
	p, _ := w.perp.Position(context.Background(), id)
	return p
}

func (w *world) hedged(id uint32) bool {
	spot, short := w.vault.Spot(id), -w.pos(id)
	return short > 0 && !sizing.Drifted(spot, short, params.TolBps, specs[id].Lot)
}

func (w *world) nav() int64 {
	st, _ := w.vault.State(context.Background())
	return st.NAV
}

func TestRoundTripFlatHedged(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	for _, s := range specs {
		w.vault.SetMode(s.ID, vk.ModeHedged)
	}
	w.run(30)
	for _, s := range specs {
		if !w.hedged(s.ID) || w.k.Phase(s.ID) != vk.Hedged {
			t.Fatalf("%s not hedged: spot %d pos %d phase %s", s.Symbol, w.vault.Spot(s.ID), w.pos(s.ID), w.k.Phase(s.ID))
		}
	}
	if idle := w.vault.Idle(); idle < 50_000e6 || idle > 60_000e6 {
		t.Fatalf("idle should sit near the 5%% buffer: %d", idle)
	}
	// BTC got 40% of deployable, half to spot at 1x
	if n := sizing.Notional(w.vault.Spot(BTC), 100_000e6, false); n < 180_000e6 || n > 190_000e6 {
		t.Fatalf("BTC spot notional %d", n)
	}
	nav0, eth := w.nav(), w.vault.Spot(ETH)

	w.vault.SetMode(BTC, vk.ModeFlat)
	w.run(20)
	if w.vault.Spot(BTC) != 0 || w.pos(BTC) != 0 || w.k.Phase(BTC) != vk.Flat {
		t.Fatalf("BTC not flat: spot %d pos %d", w.vault.Spot(BTC), w.pos(BTC))
	}
	if w.vault.Spot(ETH) < eth || !w.hedged(ETH) {
		t.Fatal("other markets untouched by an exit")
	}
	if w.perp.Col() > sizing.Margin(totalShort(w), 10_000)*102/100+params.MinMove {
		t.Fatalf("freed BTC margin not returned: col %d", w.perp.Col())
	}

	w.vault.SetMode(BTC, vk.ModeHedged)
	w.run(30)
	if !w.hedged(BTC) {
		t.Fatalf("BTC not re-hedged: spot %d pos %d", w.vault.Spot(BTC), w.pos(BTC))
	}
	if nav := w.nav(); nav != nav0 {
		t.Fatalf("zero-fee round trip must keep NAV: %d -> %d", nav0, nav)
	}
}

func totalShort(w *world) int64 {
	var n int64
	for _, s := range specs {
		n += sizing.Notional(-w.pos(s.ID), w.perp.Prices[s.ID], true)
	}
	return n
}

func TestQueuedWithdrawalFulfilled(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	for _, s := range specs {
		w.vault.SetMode(s.ID, vk.ModeHedged)
	}
	w.run(30)
	before := map[uint32]int64{}
	for _, s := range specs {
		before[s.ID] = -w.pos(s.ID)
	}
	id := w.vault.Request(300_000e6)
	w.run(40)
	if w.vault.Paid[id] != 300_000e6 {
		t.Fatalf("not fulfilled: idle %d", w.vault.Idle())
	}
	for _, s := range specs {
		after := -w.pos(s.ID)
		cut := float64(before[s.ID]-after) / float64(before[s.ID])
		if cut < 0.2 || cut > 0.4 || !w.hedged(s.ID) {
			t.Fatalf("%s unwind not pro-rata: %d -> %d (%.2f)", s.Symbol, before[s.ID], after, cut)
		}
	}
}

func TestRestartMidExitNoDoubleOrder(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.vault.SetMode(ETH, vk.ModeHedged)
	w.run(20)
	if !w.hedged(ETH) {
		t.Fatal("setup")
	}
	short := -w.pos(ETH)
	w.perp.SettleDelay = 5 * time.Second
	eff := w.perp.Effective()

	w.vault.SetMode(ETH, vk.ModeFlat)
	w.k.Tick(context.Background()) // close-short placed, fill not on chain yet
	placed := len(w.perp.Placed)
	w.k = w.keeper() // crash + restart: fresh memory
	w.run(1)
	if len(w.perp.Placed) != placed+1 {
		t.Fatalf("restart should resubmit the identical order once, placed %d -> %d", placed, len(w.perp.Placed))
	}
	if a, b := w.perp.Placed[placed-1], w.perp.Placed[placed]; a != b {
		t.Fatalf("resubmitted order differs (would double fill):\n%+v\n%+v", a, b)
	}
	w.run(20)
	if w.pos(ETH) != 0 || w.vault.Spot(ETH) != 0 {
		t.Fatalf("exit not resumed: pos %d spot %d", w.pos(ETH), w.vault.Spot(ETH))
	}
	if got := w.perp.Effective() - eff; got != 1 {
		t.Fatalf("closed %d short with %d effective orders, want 1", short, got)
	}
}

func TestRestartResumesFromChain(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.vault.SetMode(HYPE, vk.ModeHedged)
	w.perp.FailPlace = 1 << 30 // short leg down: spot bought, no short
	w.run(3)
	if w.vault.Spot(HYPE) == 0 || w.pos(HYPE) != 0 {
		t.Fatal("setup: want spot without short")
	}
	w.perp.FailPlace = 0
	w.k = w.keeper()
	w.run(10)
	if !w.hedged(HYPE) {
		t.Fatalf("restart did not resume at open-short: spot %d pos %d", w.vault.Spot(HYPE), w.pos(HYPE))
	}
	if w.alerts.Count(vk.Critical) == 0 {
		t.Fatal("unhedged leg failures must alert critical")
	}
}

func TestShortLegStuckFallsBackToFlat(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.vault.SetMode(ETH, vk.ModeHedged)
	w.perp.NoFill = true // orders accepted, never fill
	w.run(int(params.MaxUnhedged/time.Second) + 30)
	if w.vault.Spot(ETH) != 0 && sizing.FloorTo(w.vault.Spot(ETH), specs[ETH].Lot) != 0 {
		t.Fatalf("unhedged spot kept past MaxUnhedged: %d", w.vault.Spot(ETH))
	}
}

func TestSwapRetryThenSucceeds(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.vault.SetMode(BTC, vk.ModeHedged)
	w.run(15)
	w.vault.FailSwap = 2
	w.vault.SetMode(BTC, vk.ModeFlat)
	w.run(20)
	if w.vault.Spot(BTC) != 0 || w.pos(BTC) != 0 {
		t.Fatalf("exit not completed after swap retries: spot %d pos %d", w.vault.Spot(BTC), w.pos(BTC))
	}
	if w.alerts.Count(vk.Critical) < 2 {
		t.Fatal("each failed leg-2 swap alerts")
	}
}

func TestDriftTrim(t *testing.T) {
	w := newWorld(t, 1_000_000e6)
	w.vault.SetMode(BTC, vk.ModeHedged)
	w.run(15)
	w.vault.Swap(context.Background(), vk.Swap{Market: BTC, AmountIn: w.vault.Spot(BTC) / 10}) // spot leaks 10%
	w.loose = true
	w.run(3)
	if -w.pos(BTC) > w.vault.Spot(BTC) {
		t.Fatal("over-short not trimmed first")
	}
	w.loose = false
	w.run(15)
	if !w.hedged(BTC) {
		t.Fatalf("drift not trimmed: spot %d pos %d", w.vault.Spot(BTC), w.pos(BTC))
	}
}
