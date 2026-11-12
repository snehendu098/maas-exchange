package mmbot

import "math"

// Params are quoting knobs shared by all markets; notionals in USDC 1e6.
type Params struct {
	Levels        int
	SpreadBps     float64 // level 1 distance from center
	StepBps       float64 // extra distance per further level
	SkewBps       float64 // center shift at max inventory
	ReplaceBps    float64 // requote when index moves more than this
	LevelNotional float64 // per order
	MaxNotional   float64 // |position| cap; side that grows it is pulled at cap
	Jitter        float64 // 0..1: random size (±Jitter) and gap (±Jitter/2 step) per level
	DepthGrowth   float64 // level i size = LevelNotional * (1 + i*DepthGrowth)
	Churn         int     // levels per side re-jittered each tick (HFT-style flicker); 0 = static
}

// Shape is per-level jitter, held between requotes so unchanged levels keep their exact prices.
type Shape struct{ BidGap, AskGap, BidSize, AskSize []float64 }

// NewShape draws Levels jitters from rnd (uniform [0,1)); gaps in steps, sizes as factors.
func NewShape(p Params, rnd func() float64) *Shape {
	j := func() float64 { return p.Jitter * (2*rnd() - 1) }
	s := &Shape{}
	for range p.Levels {
		s.BidGap, s.AskGap = append(s.BidGap, j()/2), append(s.AskGap, j()/2)
		s.BidSize, s.AskSize = append(s.BidSize, 1+j()), append(s.AskSize, 1+j())
	}
	return s
}

type Quote struct {
	Buy         bool
	Price, Size uint64
}

// Basis is a mean-reverting (Ornstein-Uhlenbeck) perp premium in bps: stationary std ≈ Std, half-life ≈ 0.7·Tau.
// It shifts the book center off index like real perp flow does, so mark/funding move.
type Basis struct {
	Bps            float64
	Mean, Std, Tau float64 // bps, bps, seconds; Mean > 0 = perp trades rich, longs mostly pay funding
}

// Step advances dt seconds with standard normal z; clamped to Mean ± 3·Std.
func (b *Basis) Step(dt, z float64) {
	if b.Tau == 0 {
		return
	}
	sigma := b.Std * math.Sqrt(2/b.Tau)
	b.Bps += (b.Mean-b.Bps)*dt/b.Tau + sigma*math.Sqrt(dt)*z
	b.Bps = max(b.Mean-3*b.Std, min(b.Mean+3*b.Std, b.Bps))
}

// Mutate re-draws Churn random levels per side, so only those orders get replaced next reconcile.
func (s *Shape) Mutate(p Params, rnd func() float64) {
	j := func() float64 { return p.Jitter * (2*rnd() - 1) }
	n := len(s.BidGap)
	for range min(p.Churn, n) {
		b, a := int(rnd()*float64(n)), int(rnd()*float64(n))
		s.BidGap[b], s.BidSize[b] = j()/2, 1+j()
		s.AskGap[a], s.AskSize[a] = j()/2, 1+j()
	}
}

// Quotes builds Levels bids+asks around index (USDC 1e6/base), center shifted against pos (base 1e8).
// sh jitters gaps/sizes (nil = flat ladder).
func Quotes(index, tick, lot uint64, pos int64, p Params, sh *Shape) []Quote {
	if sh == nil {
		sh = NewShape(Params{Levels: p.Levels}, func() float64 { return 0.5 })
	}
	inv := max(-1, min(1, float64(pos)*float64(index)/1e8/p.MaxNotional))
	center := float64(index) * (1 - inv*p.SkewBps/1e4)
	size := func(i int, f float64) uint64 {
		n := p.LevelNotional * (1 + float64(i)*p.DepthGrowth) * f
		return max(lot, uint64(n*1e8/float64(index))/lot*lot)
	}
	var out []Quote
	for i := range p.Levels {
		bidOff := (p.SpreadBps + (float64(i)+sh.BidGap[i])*p.StepBps) / 1e4
		askOff := (p.SpreadBps + (float64(i)+sh.AskGap[i])*p.StepBps) / 1e4
		if bid := uint64(center*(1-bidOff)) / tick * tick; inv < 1 && bid > 0 {
			out = append(out, Quote{true, bid, size(i, sh.BidSize[i])})
		}
		if inv > -1 {
			out = append(out, Quote{false, uint64(math.Ceil(center*(1+askOff)/float64(tick))) * tick, size(i, sh.AskSize[i])})
		}
	}
	return out
}

// Stale: no quote yet, or index moved more than bps since last quote.
func Stale(last, now uint64, bps float64) bool {
	return last == 0 || math.Abs(float64(now)-float64(last)) > float64(last)*bps/1e4
}
