package vaultkeeper

import (
	"fmt"
	"time"

	"maas/backend/internal/vaultkeeper/sizing"
)

// Obs is one market as read from chain; Position is the signed perp size.
type Obs struct {
	Mode           Mode
	Spot, Position int64
	Lot            int64
}

// Decision is what Step wants done. Want = expected position once a perp leg settles.
type Decision struct {
	Phase, Prev Phase
	Leg         Leg
	From, Want  int64
	Attempt     int
	Waiting     bool
	Notes       []Note
}

// Note is an alert-worthy event.
type Note struct {
	Level Level
	Msg   string
}

type target struct {
	size  int64
	exact bool // tol 0: unwinds must land even below the drift band
}

type pending struct {
	want     int64
	deadline time.Time
}

type hold struct {
	size  int64
	until time.Time
}

// Machine is one market's leg state machine. Not safe for concurrent use.
type Machine struct {
	ID     uint32
	P      Policy
	phase  Phase
	target *target
	leg    *pending
	fails  int
	retry  time.Time
	since  time.Time // unhedged since
	hold   *hold
	seen   bool // stepped once: phase reflects chain
}

func NewMachine(id uint32, p Policy) *Machine { return &Machine{ID: id, P: p} }

func (m *Machine) Phase() Phase { return m.phase }

// AtRest: stepped, phase at rest, no perp leg in flight.
func (m *Machine) AtRest() bool { return m.seen && m.phase.Rest() && m.leg == nil }

// SetTarget sets a sticky hedged size until reached; exact skips the drift band.
func (m *Machine) SetTarget(size int64, exact bool) { m.target = &target{size, exact} }

// Step advances on a fresh observation.
func (m *Machine) Step(o Obs, now time.Time) Decision {
	d := Decision{Prev: m.phase}
	m.seen = true
	if m.leg != nil {
		switch {
		case o.Position == m.leg.want:
			m.leg, m.fails, m.retry = nil, 0, time.Time{}
		case !now.Before(m.leg.deadline):
			m.leg = nil
			d.Notes = append(d.Notes, m.fail(now, "perp leg not settled by deadline"))
		default:
			d.Phase, d.Waiting = m.phase, true
			return d
		}
	}
	if m.hold != nil && !now.Before(m.hold.until) {
		m.hold = nil
	}
	if m.phase.Unhedged() && m.hold == nil && !m.since.IsZero() && now.Sub(m.since) > m.P.MaxUnhedged {
		m.hold = &hold{m.fallback(m.phase, o), now.Add(m.P.HoldOff)}
		m.fails, m.retry = 0, time.Time{}
		d.Notes = append(d.Notes, Note{Critical, fmt.Sprintf("unhedged > %s in %s: fallback to size %d", m.P.MaxUnhedged, m.phase, m.hold.size)})
	}
	if now.Before(m.retry) {
		d.Phase, d.Waiting = m.phase, true
		return d
	}
	phase, leg := m.derive(o)
	m.track(phase, now)
	if phase.Rest() {
		m.target = nil
	}
	d.Phase, d.Leg, d.Attempt = phase, leg, m.fails
	if leg.Perp() {
		d.From, d.Want = o.Position, o.Position+leg.Size
		if leg.Kind == LegOpenShort {
			d.Want = o.Position - leg.Size
		}
	}
	return d
}

// Submitted records a placed perp leg; Step waits for it on chain.
func (m *Machine) Submitted(d Decision, now time.Time) {
	m.leg = &pending{d.Want, now.Add(m.P.SettleTimeout)}
}

// Done records a sync leg result (swap, margin, or failed order placement).
func (m *Machine) Done(err error, now time.Time) *Note {
	if err == nil {
		m.fails, m.retry = 0, time.Time{}
		return nil
	}
	n := m.fail(now, err.Error())
	return &n
}

func (m *Machine) fail(now time.Time, why string) Note {
	m.fails++
	wait := m.P.backoff(m.fails)
	m.retry = now.Add(wait)
	lvl := Warn
	if m.phase.Unhedged() {
		lvl = Critical
	}
	return Note{lvl, fmt.Sprintf("%s failed (attempt %d, retry in %s): %s", m.phase, m.fails, wait, why)}
}

func (m *Machine) derive(o Obs) (Phase, Leg) {
	size, tol := m.goal(o)
	return Derive(View{Spot: o.Spot, Short: -o.Position, Target: size, Lot: o.Lot, Tol: tol})
}

// goal: hold > FLAT (exact 0) > sticky target > hedge what spot is held.
func (m *Machine) goal(o Obs) (size, tol int64) {
	switch {
	case m.hold != nil:
		return m.hold.size, sizing.Tolerance(m.hold.size, m.P.TolBps, o.Lot)
	case o.Mode == ModeFlat:
		return 0, 0
	case m.target != nil && m.target.exact:
		return m.target.size, 0
	case m.target != nil:
		return m.target.size, sizing.Tolerance(m.target.size, m.P.TolBps, o.Lot)
	}
	size = sizing.FloorTo(o.Spot, o.Lot)
	return size, sizing.Tolerance(size, m.P.TolBps, o.Lot)
}

// fallback: short leg stuck -> sell spot down to short; spot sale stuck -> re-short to hedge.
func (m *Machine) fallback(p Phase, o Obs) int64 {
	if p == EnterOpenShort {
		return max(-o.Position, 0)
	}
	return sizing.FloorTo(o.Spot, o.Lot)
}

func (m *Machine) track(p Phase, now time.Time) {
	m.phase = p
	switch {
	case !p.Unhedged():
		m.since = time.Time{}
	case m.since.IsZero():
		m.since = now
	}
}
