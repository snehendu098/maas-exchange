package indexer

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	"maas/backend/internal/platform/bus"
)

const runLock = 7_000_002 // advisory lock: one indexer per db

// Config is what the loop needs from platform config.
type Config struct {
	Contracts  Contracts
	StartBlock uint64 // 0 = start at current final head
	Poll       time.Duration
	Symbols    map[uint32]string
}

// Indexer mirrors exchange/vault events from final NEAR blocks into Postgres and engine.in.chain.
type Indexer struct {
	cfg   Config
	src   *Fetcher
	pool  *pgxpool.Pool
	js    jetstream.JetStream
	m     *Mapper
	log   *slog.Logger
	final uint64 // last seen final height
	dirty bool   // publish gap possible => full snapshot before next step
}

func New(cfg Config, src *Fetcher, pool *pgxpool.Pool, js jetstream.JetStream, log *slog.Logger) *Indexer {
	return &Indexer{cfg: cfg, src: src, pool: pool, js: js, m: NewMapper(cfg.Contracts, cfg.Symbols), log: log, dirty: true}
}

// Run holds the single-replica lock and steps until ctx ends.
func (x *Indexer) Run(ctx context.Context) error {
	conn, err := x.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	c := conn.Hijack() // lock lives as long as this conn
	defer c.Close(context.Background())
	var ok bool
	if err := c.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, runLock).Scan(&ok); err != nil || !ok {
		return errors.Join(err, errors.New("indexer: another replica holds the lock"))
	}
	for {
		idle, err := x.Step(ctx)
		if err != nil {
			x.log.Error("step", "err", err)
		}
		if idle || err != nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(x.cfg.Poll):
			}
		}
	}
}

// Step indexes the block after the cursor. idle=true when caught up with final head.
func (x *Indexer) Step(ctx context.Context) (idle bool, err error) {
	last, ok, err := cursor(ctx, x.pool)
	if err != nil {
		return false, err
	}
	from := last + 1
	if !ok || from > x.final { // refresh head only when caught up: saves rate limit
		if x.final, err = x.src.Final(ctx); err != nil {
			return false, err
		}
	}
	if !ok {
		from = x.cfg.StartBlock
		if from == 0 {
			from = x.final
		}
	}
	if x.dirty {
		if err := x.publishAll(ctx, x.final); err != nil {
			return false, err
		}
	}
	if from > x.final {
		return true, nil
	}
	b, err := x.src.Block(ctx, from)
	if err != nil {
		return false, err
	}
	var ops []Op
	hash := ""
	if b != nil { // nil = skipped height, just advance cursor
		if ops, err = x.m.Block(b); err != nil {
			return false, err
		}
		hash = b.Block.Header.Hash
	}
	return false, x.commit(ctx, from, func(tx pgx.Tx) (keys, error) { return applyBlock(ctx, tx, from, hash, ops) })
}

// commit runs fn in a tx, then publishes committed snapshots of its keys.
// Publish failure after commit marks dirty => full snapshot next step.
func (x *Indexer) commit(ctx context.Context, blk uint64, fn func(pgx.Tx) (keys, error)) error {
	var k keys
	err := pgx.BeginFunc(ctx, x.pool, func(tx pgx.Tx) (err error) {
		k, err = fn(tx)
		return err
	})
	if err != nil {
		return err
	}
	return x.publish(ctx, k, blk)
}

func (x *Indexer) publishAll(ctx context.Context, head uint64) error {
	k, err := allKeys(ctx, x.pool)
	if err != nil {
		return err
	}
	if err := x.publish(ctx, k, head); err != nil {
		return err
	}
	x.dirty = false
	return nil
}

// publish sends snapshots of k; engine applies last-write-wins, so corrections just resend.
func (x *Indexer) publish(ctx context.Context, k keys, blk uint64) error {
	if err := x.send(ctx, k, blk); err != nil {
		x.dirty = true
		return err
	}
	return nil
}

func (x *Indexer) send(ctx context.Context, k keys, blk uint64) error {
	ups, err := snapshots(ctx, x.pool, k, blk)
	if err != nil {
		return err
	}
	for _, u := range ups {
		b, err := proto.Marshal(u)
		if err != nil {
			return err
		}
		if _, err := x.js.Publish(ctx, bus.EngineInChain, b); err != nil {
			return err
		}
	}
	return nil
}
