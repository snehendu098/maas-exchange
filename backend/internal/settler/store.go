package settler

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ref identifies an engine fill.
type ref struct {
	Market uint32
	Trade  uint64
}

// batch is one settle tx (Settled) or a tx-less set of rejected fills (Failed).
type batch struct {
	ID      string
	Status  string // sent|mined|published
	Nonce   uint64
	Raw     []byte // signed tx, rebroadcast as-is
	TxHash  string
	Block   uint64 // last receipt block of TxHash
	Settled []ref
	Failed  []ref
}

// Store persists batches + fill ids in Postgres (0003_settle.sql).
type Store struct{ Pool *pgxpool.Pool }

// known returns which refs already have a row (settled, failed or in flight).
func (s Store) known(ctx context.Context, refs []ref) (map[ref]bool, error) {
	ms, ts := make([]int32, len(refs)), make([]int64, len(refs))
	for i, r := range refs {
		ms[i], ts[i] = int32(r.Market), int64(r.Trade)
	}
	rows, err := s.Pool.Query(ctx, `SELECT f.market, f.trade_id FROM settled_fills f
		JOIN unnest($1::int[], $2::bigint[]) AS u(m, t) ON f.market = u.m AND f.trade_id = u.t`, ms, ts)
	if err != nil {
		return nil, err
	}
	out := map[ref]bool{}
	var m int32
	var t int64
	_, err = pgx.ForEachRow(rows, []any{&m, &t}, func() error {
		out[ref{uint32(m), uint64(t)}] = true
		return nil
	})
	return out, err
}

// begin records the batch and its fills in one tx; PK on fills rejects any double insert.
func (s Store) begin(ctx context.Context, b *batch) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO settle_batches (id, status, nonce, raw_tx, tx_hash) VALUES ($1, $2, $3, $4, NULLIF($5, ''))`,
			b.ID, b.Status, int64(b.Nonce), b.Raw, b.TxHash); err != nil {
			return err
		}
		for ok, rs := range map[bool][]ref{true: b.Settled, false: b.Failed} {
			for _, r := range rs {
				var v *bool // NULL until mined
				if !ok || b.Status != "sent" {
					v = &ok
				}
				if _, err := tx.Exec(ctx, `INSERT INTO settled_fills VALUES ($1, $2, $3, $4)`, int32(r.Market), int64(r.Trade), b.ID, v); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s Store) mined(ctx context.Context, id string, blk uint64) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE settled_fills SET ok = true WHERE batch_id = $1 AND ok IS NULL`, id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE settle_batches SET status = 'mined', block_number = $2 WHERE id = $1`, id, int64(blk))
		return err
	})
}

// drop forgets a batch whose tx failed or never landed, so its fills get redone.
func (s Store) drop(ctx context.Context, id string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM settle_batches WHERE id = $1`, id)
	return err
}

func (s Store) published(ctx context.Context, id string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE settle_batches SET status = 'published' WHERE id = $1`, id)
	return err
}

// unfinished loads sent/mined batches with their fills, oldest first.
func (s Store) unfinished(ctx context.Context) ([]*batch, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id, status, coalesce(nonce, 0), raw_tx, coalesce(tx_hash, ''), coalesce(block_number, 0)
		FROM settle_batches WHERE status <> 'published' ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	var out []*batch
	for rows.Next() {
		var b batch
		var nonce int64
		var blk int64
		if err := rows.Scan(&b.ID, &b.Status, &nonce, &b.Raw, &b.TxHash, &blk); err != nil {
			return nil, err
		}
		b.Nonce, b.Block = uint64(nonce), uint64(blk)
		out = append(out, &b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, b := range out {
		rows, err := s.Pool.Query(ctx, `SELECT market, trade_id, ok IS NOT FALSE FROM settled_fills WHERE batch_id = $1 ORDER BY trade_id`, b.ID)
		if err != nil {
			return nil, err
		}
		var m int32
		var t int64
		var ok bool
		if _, err := pgx.ForEachRow(rows, []any{&m, &t, &ok}, func() error {
			if ok {
				b.Settled = append(b.Settled, ref{uint32(m), uint64(t)})
			} else {
				b.Failed = append(b.Failed, ref{uint32(m), uint64(t)})
			}
			return nil
		}); err != nil {
			return nil, err
		}
	}
	return out, nil
}
