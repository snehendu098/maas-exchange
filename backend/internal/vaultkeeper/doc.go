// Package vaultkeeper executes delta-vault legs: per-market state machine rebuilt from chain each tick,
// never naked short (exit: close short then sell spot; enter: buy spot then short). Adapters live in adapter/.
package vaultkeeper
