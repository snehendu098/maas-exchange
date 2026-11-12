package indexer

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"
)

func fixture(t *testing.T) *Block {
	t.Helper()
	raw, err := os.ReadFile("testdata/block.json")
	if err != nil {
		t.Fatal(err)
	}
	var b Block
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	return &b
}

func TestMapBlock(t *testing.T) {
	m := NewMapper(Contracts{Exchange: "ex.testnet", Vault: "vault.testnet"}, map[uint32]string{1: "BTC"})
	got, err := m.Block(fixture(t))
	if err != nil {
		t.Fatal(err)
	}
	ts := time.Unix(0, 1700000000123456789).UTC()
	b := uint64(100)
	a := "alice.testnet"
	want := []Op{
		{sqlCollateral, []any{b, uint32(0), a, "5000000"}},
		{sqlBalance, []any{a, "5000000", b}},
		{sqlPosUpdate, []any{b, uint32(1), a, uint32(1), "-200000000", "100000000", "9", "-1", "2"}},
		{sqlPosition, []any{a, uint32(1), "-200000000", "100000000", "9", b}},
		{sqlCollateral, []any{b, uint32(1), a, "-42"}},
		{sqlBalance, []any{a, "-42", b}},
		{sqlFill, []any{b, uint32(2), "tx2", ts, uint32(1), "aa", "bb", a, "bob.testnet", true, "50000000000", "200000000", "10", "20"}},
		{sqlFunding, []any{b, uint32(3), uint32(1), "-3", "7", "11", ts}},
		{sqlFundingPayments, []any{b, uint32(3), uint32(1), "-3", "-21", ts}},
		{sqlMarketFunding, []any{uint32(1), "11"}},
		{sqlMarket, []any{uint32(1), "BTC", "1000000", "100000", "500", "250"}},
		// index 5 = price_pushed (no ops); failed + foreign executor + nep141 skipped
		{sqlVaultEvent, []any{b, uint32(6), "tx3", ts, "deposited", `{"account_id": "alice.testnet", "assets": "5", "shares": "5"}`}},
		{sqlOrder, []any{b, uint32(7), "cc", "bob.testnet"}},
		{sqlLiquidation, []any{b, uint32(8), "bob.testnet", uint32(1), "keeper.testnet", "7", "1", "2", "0"}},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d ops, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if !reflect.DeepEqual(got[i], want[i]) {
			t.Errorf("op %d:\n got  %v\n want %v", i, got[i].Args, want[i].Args)
		}
	}
}

func TestMapBadNumber(t *testing.T) {
	m := NewMapper(Contracts{Exchange: "ex"}, nil)
	_, err := m.mapOne(stdExchange, "deposited", json.RawMessage(`{"account_id":"a","collateral":"x1"}`), Loc{})
	if err == nil {
		t.Fatal("want error on non-numeric collateral")
	}
}
