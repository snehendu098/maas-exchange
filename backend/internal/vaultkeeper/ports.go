package vaultkeeper

import (
	"context"
	"time"
)

// Vault is the delta-vault as the keeper needs it. Amounts in domain units.
type Vault interface {
	Address() string
	State(ctx context.Context) (VaultState, error)
	Swap(ctx context.Context, s Swap) error
	DepositMargin(ctx context.Context, usdc int64) error
	WithdrawMargin(ctx context.Context, usdc int64) error
	Fulfill(ctx context.Context, id uint64) error
	// Events wakes the loop; state is always re-read from chain.
	Events(ctx context.Context) (<-chan Event, error)
}

// Swap is exact-in: buy spends USDC for base 1e8, sell spends base 1e8 for USDC.
type Swap struct {
	Market           uint32
	Buy              bool
	AmountIn, MinOut int64
}

type EventKind uint8

const (
	ModeChanged EventKind = iota + 1
	WithdrawRequested
)

type Event struct {
	Kind    EventKind
	Market  uint32
	Mode    Mode
	Request uint64
}

// Perp is the CLOB + exchange, trading as the vault (orders signed by its registered trading key).
type Perp interface {
	Markets(ctx context.Context) ([]Spec, error)
	Index(ctx context.Context) (map[uint32]int64, error)
	Position(ctx context.Context, market uint32) (int64, error)
	Collateral(ctx context.Context) (int64, error)
	Place(ctx context.Context, o Order) error
}

// Order is an IOC limit for the vault; Nonce/ExpiryMs come from OrderKey so retries are deterministic.
type Order struct {
	Market          uint32
	Buy, ReduceOnly bool
	Size, Price     int64
	Nonce, ExpiryMs uint64
}

type Clock interface{ Now() time.Time }

type Level uint8

const (
	Info Level = iota
	Warn
	Critical
)

func (l Level) String() string { return [...]string{"info", "warn", "critical"}[l] }

type Alert struct {
	Level  Level
	Market uint32
	Msg    string
}

type Alerter interface {
	Alert(ctx context.Context, a Alert)
}

// SystemClock is wall time.
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }
