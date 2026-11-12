package vaultkeeper

// Mode is the vault's per-market strategy mode (set_mode, owner-run rebalancer).
type Mode uint8

const (
	ModeFlat Mode = iota
	ModeHedged
)

func (m Mode) String() string {
	if m == ModeHedged {
		return "HEDGED"
	}
	return "FLAT"
}

// Spec is a perp market's grid; Lot is base 1e8, Tick is USDC 1e6.
type Spec struct {
	ID        uint32
	Symbol    string
	Lot, Tick int64
}

// Withdrawal is one queued request; Assets is USDC owed by fulfill.
type Withdrawal struct {
	ID     uint64
	Assets int64
}

// Config is the owner-set vault config the keeper reads.
type Config struct {
	Weights       map[uint32]int64 // bps, sum 1e4
	ShortLevBps   int64            // short notional / margin, 1e4 = 1x
	IdleBufferBps int64            // of NAV
}

// VaultState is one read of the vault; Spot is base 1e8 per market.
type VaultState struct {
	Idle, NAV int64
	Config    Config
	Modes     map[uint32]Mode
	Spot      map[uint32]int64
	Queue     []Withdrawal
}

// Pending is total USDC owed to the withdraw queue.
func (s VaultState) Pending() int64 {
	var n int64
	for _, w := range s.Queue {
		n += w.Assets
	}
	return n
}
