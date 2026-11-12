package vaultchain

import (
	"math/big"
	"testing"
)

func TestUnits(t *testing.T) {
	if fromSize(150_000_000, 18).String() != "1500000000000000000" {
		t.Fatal("1e8 -> 18dp")
	}
	if fromSize(12_345, 8).Int64() != 12_345 || fromSize(150_000_099, 6).Int64() != 1_500_000 {
		t.Fatal("8dp identity / 6dp floor")
	}
}

func TestQueuedAssets(t *testing.T) {
	b := big.NewInt
	if got := queuedAssets(b(100), b(199), b(99)); got.Int64() != 201 { // exact 200, +1
		t.Fatal(got)
	}
	if got := queuedAssets(b(1), b(2), b(1)); got.Int64() != 3 { // ceil(1.5)=2, +1
		t.Fatal(got)
	}
}
