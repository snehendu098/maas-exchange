package indexer

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"maas/backend/internal/platform/db"
)

// Needs TEST_DATABASE_URL pointing at a throwaway db.
func TestApplyBlockDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL unset")
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, s := range []string{"blocks", "balances", "positions", "collateral_updates", "position_updates", "fills",
		"orders", "funding_updates", "funding_payments", "liquidations", "candles", "markets", "vault_events"} {
		if _, err := pool.Exec(ctx, "TRUNCATE "+s); err != nil {
			t.Fatal(err)
		}
	}
	m := NewMapper(Contracts{Exchange: "ex.testnet", Vault: "vault.testnet"}, map[uint32]string{1: "BTC"})
	ops, err := m.Block(fixture(t))
	if err != nil {
		t.Fatal(err)
	}
	var k keys
	for range 2 { // replay must be idempotent
		if err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) (err error) {
			k, err = applyBlock(ctx, tx, 100, "HASH100", ops)
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	if h, ok, err := cursor(ctx, pool); err != nil || !ok || h != 100 {
		t.Fatalf("cursor = %d %v %v", h, ok, err)
	}
	if len(k.accts) != 1 || k.accts[0] != "alice.testnet" || len(k.pos) != 1 {
		t.Fatalf("keys = %+v", k)
	}
	var col, size, candle, vault, pays string
	if err := pool.QueryRow(ctx, `SELECT (SELECT collateral::text FROM balances), (SELECT size::text FROM positions),
		(SELECT string_agg(interval||':'||c::text||':'||volume::text, ',' ORDER BY interval) FROM candles),
		(SELECT data->>'shares' FROM vault_events), (SELECT amount::text FROM funding_payments)`).Scan(&col, &size, &candle, &vault, &pays); err != nil {
		t.Fatal(err)
	}
	// funding: -2e8 * -21 = 4.2e9 / 1e26 -> ceil = 1
	if col != "-42" || size != "-200000000" || candle != "1h:50000000000:200000000,1m:50000000000:200000000,5m:50000000000:200000000" || vault != "5" || pays != "1" {
		t.Fatalf("got col=%s size=%s candle=%s vault=%s pays=%s", col, size, candle, vault, pays)
	}
	ups, err := snapshots(ctx, pool, k, 100)
	if err != nil || len(ups) != 2 || ups[0].GetBalance().Collateral != "-42" || ups[0].GetBalance().LogIndex != 1 {
		t.Fatalf("snapshots = %v %v", ups, err)
	}
	if err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error { _, err := applyBlock(ctx, tx, 101, "", nil); return err }); err != nil {
		t.Fatal(err)
	}
	if h, _, _ := cursor(ctx, pool); h != 101 {
		t.Fatalf("cursor after skip = %d", h)
	}
}
