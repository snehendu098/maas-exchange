package vaultkeeper

import "time"

// Policy is the per-market leg timing + tolerance knobs.
type Policy struct {
	TolBps        int64         // drift band, bps of target
	SettleTimeout time.Duration // perp leg must show on chain by then
	BackoffBase   time.Duration
	BackoffMax    time.Duration
	MaxUnhedged   time.Duration // spot without short longer than this -> fallback
	HoldOff       time.Duration // fallback target held this long
}

// backoff doubles from BackoffBase per failure, capped.
func (p Policy) backoff(fails int) time.Duration {
	d := p.BackoffBase
	for i := 1; i < fails && d < p.BackoffMax; i++ {
		d *= 2
	}
	return min(d, p.BackoffMax)
}
