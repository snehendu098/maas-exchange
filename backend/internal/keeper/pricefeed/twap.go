package pricefeed

import "time"

type point struct {
	at    time.Time
	price int64
}

// TWAP is a time-weighted avg over a trailing window. Not concurrency-safe.
type TWAP struct {
	Window time.Duration
	pts    []point
}

// Add records price at t. Out-of-order samples are dropped.
func (w *TWAP) Add(t time.Time, price int64) {
	if n := len(w.pts); n > 0 && t.Before(w.pts[n-1].at) {
		return
	}
	w.pts = append(w.pts, point{t, price})
	w.trim(t.Add(-w.Window))
}

// Value returns the TWAP over [now-Window, now]. ok=false if no sample in window.
// Each sample holds until the next; the one before the window start covers its head.
func (w *TWAP) Value(now time.Time) (int64, bool) {
	start := now.Add(-w.Window)
	w.trim(start)
	if len(w.pts) == 0 || w.pts[len(w.pts)-1].at.Before(start) {
		return 0, false
	}
	var sum, total float64
	for i, p := range w.pts {
		from, to := p.at, now
		if from.Before(start) {
			from = start
		}
		if i+1 < len(w.pts) {
			to = w.pts[i+1].at
		}
		d := float64(to.Sub(from))
		sum += float64(p.price) * d
		total += d
	}
	if total <= 0 {
		return w.pts[len(w.pts)-1].price, true
	}
	return int64(sum / total), true
}

// trim drops samples fully before start, keeping one to cover the head.
func (w *TWAP) trim(start time.Time) {
	for len(w.pts) > 1 && !w.pts[1].at.After(start) {
		w.pts = w.pts[1:]
	}
}
