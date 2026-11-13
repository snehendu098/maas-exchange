package db

import (
	"context"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"maas/backend/migrations"
)

// migrateLock is the advisory lock key serializing migrators across services.
const migrateLock = 7_000_001

// Open connects and applies pending migrations.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := Migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// Migrate runs unapplied migrations/*.sql in name order, all in one tx
// under an advisory lock (indexer + keeper boot together).
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, migrateLock); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)`); err != nil {
			return err
		}
		for _, n := range names {
			if err := apply(ctx, tx, n); err != nil {
				return fmt.Errorf("migrate %s: %w", n, err)
			}
		}
		return nil
	})
}

func apply(ctx context.Context, tx pgx.Tx, name string) error {
	tag, err := tx.Exec(ctx, `INSERT INTO schema_migrations VALUES ($1) ON CONFLICT DO NOTHING`, name)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	sql, err := migrations.FS.ReadFile(name)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, string(sql))
	return err
}
