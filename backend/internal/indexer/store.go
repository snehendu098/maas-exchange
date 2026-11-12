package indexer

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	perpv1 "maas/backend/gen/perp/v1"
)

// keys are the balance accounts and positions a block touched.
type keys struct {
	accts []string
	pos   []posKey
}

type posKey struct {
	account string
	market  uint32
}

// cursor returns the last indexed height; ok=false on a fresh db.
func cursor(ctx context.Context, pool *pgxpool.Pool) (h uint64, ok bool, err error) {
	var n *int64
	if err := pool.QueryRow(ctx, `SELECT max(number) FROM blocks`).Scan(&n); err != nil || n == nil {
		return 0, false, err
	}
	return uint64(*n), true, nil
}

// applyBlock writes ops, advances the cursor, rebuilds candles, returns touched keys.
func applyBlock(ctx context.Context, tx pgx.Tx, h uint64, hash string, ops []Op) (keys, error) {
	for _, op := range ops {
		if _, err := tx.Exec(ctx, op.SQL, op.Args...); err != nil {
			return keys{}, err
		}
	}
	// only the latest height is kept: finality means no fork checks
	if _, err := tx.Exec(ctx, `DELETE FROM blocks`); err != nil {
		return keys{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO blocks VALUES ($1,$2)`, h, hash); err != nil {
		return keys{}, err
	}
	if len(ops) == 0 {
		return keys{}, nil
	}
	touched, err := fillTimes(ctx, tx, `SELECT market_id, block_time FROM fills WHERE block_number = $1`, h)
	if err != nil {
		return keys{}, err
	}
	if err := rebuildCandles(ctx, tx, touched); err != nil {
		return keys{}, err
	}
	return touchedKeys(ctx, tx, `SELECT account FROM balances WHERE updated_block = $1`,
		`SELECT account, market_id FROM positions WHERE updated_block = $1`, h)
}

func fillTimes(ctx context.Context, tx pgx.Tx, sql string, args ...any) ([]fillTime, error) {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (f fillTime, err error) {
		return f, r.Scan(&f.market, &f.t)
	})
}

func touchedKeys(ctx context.Context, q pgx.Tx, acctSQL, posSQL string, args ...any) (k keys, err error) {
	rows, err := q.Query(ctx, acctSQL, args...)
	if err != nil {
		return k, err
	}
	if k.accts, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
		return k, err
	}
	rows, err = q.Query(ctx, posSQL, args...)
	if err != nil {
		return k, err
	}
	k.pos, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (p posKey, err error) {
		return p, r.Scan(&p.account, &p.market)
	})
	return k, err
}

// allKeys lists every current balance + position (startup / resync snapshot).
func allKeys(ctx context.Context, pool *pgxpool.Pool) (keys, error) {
	var k keys
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) (err error) {
		k, err = touchedKeys(ctx, tx, `SELECT account FROM balances`, `SELECT account, market_id FROM positions`)
		return err
	})
	return k, err
}

const sqlCandle = `
INSERT INTO candles
SELECT $1::int, $2::text, $3::timestamptz,
  (array_agg(price ORDER BY block_number, log_index))[1], max(price), min(price),
  (array_agg(price ORDER BY block_number DESC, log_index DESC))[1], sum(size)
FROM fills WHERE market_id = $1 AND block_time >= $3 AND block_time < $4
HAVING count(*) > 0`

// rebuildCandles recomputes each touched (market, interval, bucket) from fills.
func rebuildCandles(ctx context.Context, tx pgx.Tx, touched []fillTime) error {
	for b := range buckets(touched) {
		if _, err := tx.Exec(ctx, `DELETE FROM candles WHERE market_id=$1 AND interval=$2 AND bucket_start=$3`,
			b.market, b.interval, b.start); err != nil {
			return err
		}
		end := b.start.Add(Intervals[b.interval])
		if _, err := tx.Exec(ctx, sqlCandle, b.market, b.interval, b.start, end); err != nil {
			return err
		}
	}
	return nil
}

// snapshots reads committed state for k, stamped with the source row's block/log.
// Missing rows publish as zero at blk.
func snapshots(ctx context.Context, pool *pgxpool.Pool, k keys, blk uint64) ([]*perpv1.ChainUpdate, error) {
	bal := map[string]*perpv1.BalanceUpdate{}
	rows, err := pool.Query(ctx, `SELECT b.account, b.collateral::text, b.updated_block, COALESCE((SELECT max(log_index)
		FROM collateral_updates u WHERE u.account = b.account AND u.block_number = b.updated_block), 0)
		FROM balances b WHERE b.account = ANY($1)`, k.accts)
	if err != nil {
		return nil, err
	}
	var a, c string
	var bn uint64
	var li uint32
	if _, err := pgx.ForEachRow(rows, []any{&a, &c, &bn, &li}, func() error {
		bal[a] = &perpv1.BalanceUpdate{Trader: a, Collateral: c, BlockNumber: bn, LogIndex: li}
		return nil
	}); err != nil {
		return nil, err
	}
	var out []*perpv1.ChainUpdate
	for _, a := range k.accts {
		b := bal[a]
		if b == nil {
			b = &perpv1.BalanceUpdate{Trader: a, Collateral: "0", BlockNumber: blk}
		}
		out = append(out, &perpv1.ChainUpdate{Update: &perpv1.ChainUpdate_Balance{Balance: b}})
	}

	accts, mkts := make([]string, len(k.pos)), make([]int32, len(k.pos))
	for i, p := range k.pos {
		accts[i], mkts[i] = p.account, int32(p.market)
	}
	pos := map[posKey]*perpv1.PositionUpdate{}
	rows, err = pool.Query(ctx, `SELECT p.account, p.market_id, size::text, entry_notional::text, p.updated_block,
		COALESCE((SELECT max(log_index) FROM position_updates u WHERE u.account = p.account
			AND u.market_id = p.market_id AND u.block_number = p.updated_block), 0)
		FROM positions p JOIN unnest($1::text[], $2::int[]) k(a, m) ON p.account = k.a AND p.market_id = k.m`, accts, mkts)
	if err != nil {
		return nil, err
	}
	var m uint32
	var size, entry string
	if _, err := pgx.ForEachRow(rows, []any{&a, &m, &size, &entry, &bn, &li}, func() error {
		pos[posKey{a, m}] = &perpv1.PositionUpdate{Trader: a, Market: m, Size: size, EntryNotional: entry, BlockNumber: bn, LogIndex: li}
		return nil
	}); err != nil {
		return nil, err
	}
	for _, p := range k.pos {
		up := pos[p]
		if up == nil {
			up = &perpv1.PositionUpdate{Trader: p.account, Market: p.market, Size: "0", EntryNotional: "0", BlockNumber: blk}
		}
		out = append(out, &perpv1.ChainUpdate{Update: &perpv1.ChainUpdate_Position{Position: up}})
	}
	return out, nil
}
