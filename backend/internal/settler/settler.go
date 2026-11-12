package settler

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/near"
)

// Settings is settler-only env.
type Settings struct {
	BatchSize int           // SETTLER_BATCH_SIZE, default 20 (300 Tgas cap)
	BatchWait time.Duration // SETTLER_BATCH_WAIT, default 500ms
	AckWait   time.Duration // jetstream redelivery, default 30s
}

// LoadSettings reads settler env.
func LoadSettings() (Settings, error) {
	s := Settings{BatchSize: 20, BatchWait: 500 * time.Millisecond, AckWait: 30 * time.Second}
	if v := os.Getenv("SETTLER_BATCH_SIZE"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return s, fmt.Errorf("settler: SETTLER_BATCH_SIZE %q", v)
		}
		s.BatchSize = n
	}
	if v := os.Getenv("SETTLER_BATCH_WAIT"); v != "" {
		x, err := time.ParseDuration(v)
		if err != nil || x <= 0 {
			return s, fmt.Errorf("settler: SETTLER_BATCH_WAIT %q: want duration like 500ms", v)
		}
		s.BatchWait = x
	}
	return s, nil
}

// Settler batches engine fills into exchange `settle` txs signed by the operator.
type Settler struct {
	Set      Settings
	Signer   *near.Signer
	Exchange string
	JS       jetstream.JetStream
	Store    Store
}

func New(cfg config.Config, set Settings, pool *pgxpool.Pool, js jetstream.JetStream) (*Settler, error) {
	if cfg.OperatorKey == "" {
		return nil, errors.New("settler: OPERATOR_PRIVATE_KEY required")
	}
	sg, err := near.NewSigner(near.NewClient(cfg.RPCURL), cfg.OperatorAccount, cfg.OperatorKey)
	if err != nil {
		return nil, err
	}
	return &Settler{Set: set, Signer: sg, Exchange: cfg.Exchange, JS: js, Store: Store{pool}}, nil
}

// Run reconciles in-flight batches from a previous run, then consumes fills until ctx ends.
func (s *Settler) Run(ctx context.Context) error {
	if err := s.reconcile(ctx); err != nil {
		return err
	}
	cons, err := s.consumer(ctx)
	if err != nil {
		return err
	}
	for ctx.Err() == nil {
		res, err := cons.Fetch(s.Set.BatchSize, jetstream.FetchMaxWait(s.Set.BatchWait))
		if err != nil {
			slog.Warn("settler: fetch", "err", err)
			sleep(ctx, time.Second)
			continue
		}
		var msgs []jetstream.Msg
		for m := range res.Messages() {
			msgs = append(msgs, m)
		}
		if len(msgs) == 0 {
			continue
		}
		if err := s.process(ctx, msgs); err != nil && ctx.Err() == nil {
			slog.Warn("settler: batch, will retry", "fills", len(msgs), "err", err)
			for _, m := range msgs {
				m.NakWithDelay(time.Second)
			}
			if err := s.reconcile(ctx); err != nil { // e.g. publish failed after commit
				slog.Warn("settler: reconcile", "err", err)
			}
		}
	}
	return ctx.Err()
}

// consumer creates the durable fill consumer; retries until the engine made ENGINE_OUT.
func (s *Settler) consumer(ctx context.Context) (jetstream.Consumer, error) {
	for {
		c, err := s.JS.CreateOrUpdateConsumer(ctx, bus.EngineOutStream, jetstream.ConsumerConfig{
			Durable: "settler", FilterSubject: bus.EngineOutFill,
			AckPolicy: jetstream.AckExplicitPolicy, AckWait: s.Set.AckWait, MaxDeliver: -1,
		})
		if err == nil {
			return c, nil
		}
		slog.Warn("settler: consumer", "err", err)
		if !sleep(ctx, 2*time.Second) {
			return nil, ctx.Err()
		}
	}
}

type item struct {
	ref  ref
	fill Fill
}

// process settles one fetched batch. Fills are acked only after the db says they're final.
func (s *Settler) process(ctx context.Context, msgs []jetstream.Msg) error {
	defer keepAlive(ctx, msgs)()
	var fills []*perpv1.Fill
	for _, m := range msgs {
		var out perpv1.EngineOutput
		if err := proto.Unmarshal(m.Data(), &out); err != nil || out.GetFill() == nil {
			slog.Warn("settler: skip non-fill msg", "subject", m.Subject(), "err", err)
			continue
		}
		fills = append(fills, out.GetFill())
	}
	refs := make([]ref, len(fills))
	for i, f := range fills {
		refs[i] = refOf(f)
	}
	known, err := s.Store.known(ctx, refs)
	if err != nil {
		return err
	}
	rejected := &batch{ID: rand.Text(), Status: "mined"}
	var items []item
	for _, f := range fresh(fills, known) {
		x, err := s.build(ctx, f)
		if errors.Is(err, jetstream.ErrMsgNotFound) || errors.Is(err, bus.ErrNotOrder) {
			rejected.Failed = append(rejected.Failed, refOf(f))
			continue
		}
		if err != nil {
			return err
		}
		items = append(items, item{refOf(f), x})
	}
	bad, err := bisect(items, func(xs []item) (bool, error) { return s.send(ctx, xs) })
	if err != nil {
		return err
	}
	for _, x := range bad {
		rejected.Failed = append(rejected.Failed, x.ref)
	}
	if len(rejected.Failed) > 0 {
		if err := s.Store.begin(ctx, rejected); err != nil {
			return err
		}
		if err := s.publish(ctx, rejected); err != nil {
			return err
		}
	}
	for _, m := range msgs {
		m.Ack()
	}
	return nil
}

// build looks up both signed orders by engine order id (= ENGINE_IN seq).
func (s *Settler) build(ctx context.Context, f *perpv1.Fill) (Fill, error) {
	mk, err := bus.OrderAt(ctx, s.JS, f.MakerOrderId)
	if err != nil {
		return Fill{}, err
	}
	tk, err := bus.OrderAt(ctx, s.JS, f.TakerOrderId)
	if err != nil {
		return Fill{}, err
	}
	return toFill(f, mk, tk), nil
}

// send settles xs in one tx: row before broadcast, published on success, dropped on failure.
func (s *Settler) send(ctx context.Context, xs []item) (bool, error) {
	fills := make([]Fill, len(xs))
	b := &batch{ID: rand.Text(), Status: "sent"}
	for i, x := range xs {
		fills[i], b.Settled = x.fill, append(b.Settled, x.ref)
	}
	tx, err := s.Signer.Sign(ctx, s.Exchange, near.FunctionCall{
		Method: "settle", Args: near.Args(map[string]any{"fills": fills}), Gas: near.MaxGas,
	})
	if err != nil {
		return false, err
	}
	b.Nonce, b.Raw, b.TxHash = tx.Nonce, tx.Raw, tx.Hash
	if err := s.Store.begin(ctx, b); err != nil {
		return false, err
	}
	ok, err := s.finish(ctx, b)
	if err != nil || !ok {
		return ok, err
	}
	return true, s.publish(ctx, b)
}

// finish broadcasts b and waits for its outcome. ok=false: tx failed, batch dropped.
func (s *Settler) finish(ctx context.Context, b *batch) (bool, error) {
	o, err := s.Signer.Status(ctx, b.TxHash)
	if err == nil && o == nil {
		o, err = s.Signer.Broadcast(ctx, near.SignedTx{Raw: b.Raw, Hash: b.TxHash, Nonce: b.Nonce})
	}
	var re *near.RPCError
	if errors.As(err, &re) && re.Cause.Name == "INVALID_TRANSACTION" { // e.g. nonce or block hash expired: never lands
		slog.Warn("settler: tx invalid", "batch", b.ID, "err", err)
		return false, s.Store.drop(ctx, b.ID)
	}
	if err != nil {
		return false, err
	}
	if err := o.Err(); err != nil {
		slog.Warn("settler: settle failed", "batch", b.ID, "fills", len(b.Settled), "err", err)
		return false, s.Store.drop(ctx, b.ID)
	}
	if b.Block, err = s.Signer.Client.BlockHeight(ctx, o.LastBlockHash()); err != nil {
		return false, err
	}
	b.Status = "mined"
	return true, s.Store.mined(ctx, b.ID, b.Block)
}

// reconcile finishes batches a crash left sent or mined-but-unpublished.
func (s *Settler) reconcile(ctx context.Context) error {
	bs, err := s.Store.unfinished(ctx)
	if err != nil {
		return err
	}
	for _, b := range bs {
		slog.Info("settler: reconcile", "batch", b.ID, "status", b.Status)
		if b.Status == "sent" {
			ok, err := s.finish(ctx, b)
			if err != nil {
				return err
			}
			if !ok {
				continue // dropped: fills redelivered + redone
			}
		}
		if err := s.publish(ctx, b); err != nil {
			return err
		}
	}
	return nil
}

// publish tells the engine which fills settled or failed, then marks the batch done.
func (s *Settler) publish(ctx context.Context, b *batch) error {
	res := &perpv1.SettleResult{BatchId: b.ID, BlockNumber: b.Block, TxHash: b.TxHash}
	for _, r := range b.Settled {
		res.Settled = append(res.Settled, &perpv1.FillRef{Market: r.Market, TradeId: r.Trade})
	}
	for _, r := range b.Failed {
		res.Failed = append(res.Failed, &perpv1.FillRef{Market: r.Market, TradeId: r.Trade})
	}
	data, _ := proto.Marshal(res)
	if _, err := s.JS.Publish(ctx, bus.EngineInSettle, data, jetstream.WithMsgID("settle-"+b.ID)); err != nil {
		return err
	}
	slog.Info("settler: settled", "batch", b.ID, "tx", b.TxHash, "ok", len(b.Settled), "failed", len(b.Failed))
	return s.Store.published(ctx, b.ID)
}

// keepAlive marks msgs in progress while a batch waits on chain; returns stop.
func keepAlive(ctx context.Context, msgs []jetstream.Msg) func() {
	ctx, cancel := context.WithCancel(ctx)
	go func() {
		for sleep(ctx, 10*time.Second) {
			for _, m := range msgs {
				m.InProgress()
			}
		}
	}()
	return cancel
}

func sleep(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}
