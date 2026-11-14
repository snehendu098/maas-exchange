package vaultkeeper

import (
	"errors"
	"testing"
	"time"
)

var pol = Policy{TolBps: 100, SettleTimeout: 30 * time.Second, BackoffBase: 2 * time.Second, BackoffMax: 16 * time.Second,
	MaxUnhedged: 5 * time.Minute, HoldOff: 10 * time.Minute}

var t0 = time.Unix(1_700_000_000, 0)

func step(t *testing.T, m *Machine, o Obs, now time.Time, phase Phase, kind LegKind) Decision {
	t.Helper()
	d := m.Step(o, now)
	if d.Phase != phase || d.Leg.Kind != kind {
		t.Fatalf("got %s leg %d (waiting %v), want %s leg %d", d.Phase, d.Leg.Kind, d.Waiting, phase, kind)
	}
	return d
}

func TestExitFlow(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeHedged, 1e8, -1e8, lot}
	step(t, m, o, t0, Hedged, LegNone)
	o.Mode = ModeFlat
	d := step(t, m, o, t0, ExitCloseShort, LegCloseShort)
	if d.Want != 0 || d.Leg.Size != 1e8 {
		t.Fatalf("close short to 0: %+v", d)
	}
	m.Submitted(d, t0)
	if d := m.Step(o, t0.Add(time.Second)); !d.Waiting || d.Leg.Kind != LegNone {
		t.Fatal("must wait for settlement, never resubmit", d)
	}
	o.Position = 0 // settled
	step(t, m, o, t0.Add(2*time.Second), ExitSellSpot, LegSellSpot)
	if m.Done(nil, t0.Add(2*time.Second)) != nil {
		t.Fatal("ok swap gives no note")
	}
	o.Spot = 0
	step(t, m, o, t0.Add(3*time.Second), Flat, LegNone)
}

func TestEnterFlow(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeHedged, 0, 0, lot}
	m.SetTarget(1e8, false)
	step(t, m, o, t0, EnterBuySpot, LegBuySpot)
	m.Done(nil, t0)
	o.Spot = 99_950_000 // slippage
	d := step(t, m, o, t0, EnterOpenShort, LegOpenShort)
	if d.Want != -99_950_000 {
		t.Fatalf("short equal to spot held: %+v", d)
	}
	m.Submitted(d, t0)
	o.Position = d.Want
	step(t, m, o, t0.Add(time.Second), Hedged, LegNone)
	if !m.AtRest() || m.target != nil {
		t.Fatal("sticky target cleared at rest")
	}
}

func TestPerpTimeoutRetriesWithBackoff(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeFlat, 1e8, -1e8, lot}
	d := step(t, m, o, t0, ExitCloseShort, LegCloseShort)
	m.Submitted(d, t0)
	now := t0.Add(pol.SettleTimeout)
	d = m.Step(o, now)
	if !d.Waiting || len(d.Notes) != 1 || d.Notes[0].Level != Warn {
		t.Fatalf("timeout -> fail note + backoff: %+v", d)
	}
	if d := m.Step(o, now.Add(time.Second)); !d.Waiting {
		t.Fatal("inside backoff")
	}
	d = step(t, m, o, now.Add(2*time.Second), ExitCloseShort, LegCloseShort)
	if d.Attempt != 1 {
		t.Fatal("retry bumps attempt so the order hash changes", d.Attempt)
	}
}

func TestBackoff(t *testing.T) {
	want := []time.Duration{2, 4, 8, 16, 16}
	for i, w := range want {
		if got := pol.backoff(i + 1); got != w*time.Second {
			t.Errorf("fails %d: %s", i+1, got)
		}
	}
}

func TestLeg2FailureAlertsCritical(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeFlat, 1e8, 0, lot}
	step(t, m, o, t0, ExitSellSpot, LegSellSpot)
	n := m.Done(errors.New("swap reverted"), t0)
	if n == nil || n.Level != Critical {
		t.Fatalf("unhedged leg failure is critical: %+v", n)
	}
}

func TestMaxUnhedgedExitFallbackRehedges(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeFlat, 1e8, 0, lot}
	now := t0
	for now.Sub(t0) <= pol.MaxUnhedged {
		if d := m.Step(o, now); d.Leg.Kind == LegSellSpot {
			m.Done(errors.New("pool down"), now)
		}
		now = now.Add(time.Second)
	}
	d := m.Step(o, now)
	if d.Phase != EnterOpenShort || d.Leg.Size != 1e8 || len(d.Notes) != 1 || d.Notes[0].Level != Critical {
		t.Fatalf("spot sale stuck -> re-hedge: %+v", d)
	}
	m.Submitted(d, now)
	o.Position = -1e8
	step(t, m, o, now.Add(time.Second), Hedged, LegNone) // held despite FLAT
	step(t, m, o, now.Add(pol.HoldOff+time.Second), ExitCloseShort, LegCloseShort)
}

func TestMaxUnhedgedEnterFallbackSellsSpot(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeHedged, 1e8, 0, lot}
	m.Step(o, t0)
	m.Done(errors.New("gateway down"), t0)
	d := m.Step(o, t0.Add(pol.MaxUnhedged+time.Second))
	if d.Phase != ExitSellSpot || d.Leg.Size != 1e8 {
		t.Fatalf("short leg stuck -> sell spot back: %+v", d)
	}
}

func TestExactTargetIgnoresBand(t *testing.T) {
	m := NewMachine(0, pol)
	o := Obs{ModeHedged, 1e8, -1e8, lot}
	m.SetTarget(1e8-lot, true) // 1 lot cut, inside 1% band
	d := step(t, m, o, t0, ExitCloseShort, LegCloseShort)
	if d.Leg.Size != lot {
		t.Fatal(d)
	}
	m2 := NewMachine(0, pol)
	m2.SetTarget(1e8-lot, false)
	step(t, m2, o, t0, Hedged, LegNone)
}

func TestRestartResume(t *testing.T) {
	cases := []struct {
		name  string
		o     Obs
		phase Phase
		kind  LegKind
	}{
		{"short open, FLAT -> close short", Obs{ModeFlat, 1e8, -1e8, lot}, ExitCloseShort, LegCloseShort},
		{"spot only, FLAT -> sell spot", Obs{ModeFlat, 1e8, 0, lot}, ExitSellSpot, LegSellSpot},
		{"spot only, HEDGED -> open short", Obs{ModeHedged, 1e8, 0, lot}, EnterOpenShort, LegOpenShort},
		{"both, HEDGED -> rest", Obs{ModeHedged, 1e8, -1e8, lot}, Hedged, LegNone},
		{"nothing, FLAT -> rest", Obs{ModeFlat, 0, 0, lot}, Flat, LegNone},
	}
	for _, c := range cases {
		step(t, NewMachine(0, pol), c.o, t0, c.phase, c.kind)
	}
}
