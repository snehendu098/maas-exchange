package keeper

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	perpv1 "maas/backend/gen/perp/v1"
	"maas/backend/internal/keeper/funding"
	"maas/backend/internal/keeper/liquidation"
	"maas/backend/internal/keeper/pricefeed"
	"maas/backend/internal/platform/bus"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/near"
	"maas/backend/internal/platform/oracle"
)

// Keeper wires price feed, funding and liquidation.
type Keeper struct {
	Feed    *pricefeed.Feed
	Marks   *pricefeed.Marks
	Funder  *funding.Funder
	Scanner *liquidation.Scanner
	Chain   *Onchain
	set     Settings
}

// New builds a Keeper on a NEAR signer and db pool.
func New(ctx context.Context, cfg config.Config, s Settings, pool *pgxpool.Pool) (*Keeper, error) {
	if len(cfg.Markets) == 0 {
		return nil, errors.New("keeper: no markets in markets.json")
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second) // startup RPCs
	defer cancel()
	sg, err := near.NewSigner(near.NewClient(cfg.RPCURL), s.Account, s.Key)
	if err != nil {
		return nil, err
	}
	var insurance string
	if err := sg.Client.View(ctx, cfg.Exchange, "insurance", nil, &insurance); err != nil {
		return nil, err
	}
	var maxAge uint64
	if err := sg.Client.View(ctx, cfg.Exchange, "max_price_age_ms", nil, &maxAge); err != nil {
		return nil, err
	}
	if s.PushEvery >= time.Duration(maxAge)*time.Millisecond {
		return nil, fmt.Errorf("keeper: PRICE_PUSH_INTERVAL %s >= exchange max price age %dms", s.PushEvery, maxAge)
	}

	feeds, ids := map[uint32]string{}, []uint32{}
	for _, m := range cfg.Markets {
		feeds[m.ID], ids = m.FeedID, append(ids, m.ID)
	}

	k := &Keeper{set: s}
	var src pricefeed.Source = oracle.HermesFromEnv(feeds)
	if s.OracleMode == "mock" {
		prices := map[uint32]int64{}
		for _, id := range ids {
			if int(id) < len(s.MockPrices) {
				prices[id] = s.MockPrices[id]
			}
		}
		src = oracle.NewMock(prices)
	}
	k.Feed = &pricefeed.Feed{Src: src}
	k.Marks = &pricefeed.Marks{Window: s.TWAPWindow, Index: k.Feed.Index}
	k.Chain = &Onchain{Signer: sg, Exchange: cfg.Exchange, Prices: k.Feed.Snapshot, PushEvery: s.PushEvery}
	k.Funder = &funding.Funder{
		Markets: ids, Interval: s.FundingEvery, Cap: s.FundingCap, Interest: s.FundingBps,
		Mark: k.Marks.Mark, Index: k.Feed.Index, Poster: k.Chain,
	}
	k.Scanner = &liquidation.Scanner{
		Store: liquidation.PG{Pool: pool}, Chain: k.Chain, Prices: k.Feed.Snapshot,
		Insurance: insurance,
	}
	return k, nil
}

// Run consumes the book, polls prices, funds and scans until ctx ends.
func (k *Keeper) Run(ctx context.Context, js jetstream.JetStream) error {
	k.Feed.OnPoll = func(ctx context.Context, s oracle.Snapshot) {
		publishMarks(ctx, js, s.Prices)
		if err := k.Chain.PushPrices(ctx); err != nil {
			slog.Warn("keeper: push prices", "err", err)
		}
	}
	var wg sync.WaitGroup
	wg.Go(func() { k.consumeBook(ctx, js) })
	wg.Go(func() { k.Feed.Run(ctx, k.set.PollEvery) })
	wg.Go(func() { k.Funder.Run(ctx) })
	k.Scanner.Run(ctx, k.set.ScanEvery)
	wg.Wait()
	return ctx.Err()
}

// consumeBook replays ENGINE_OUT book deltas from the start (rebuilds levels);
// retries until the engine has created the stream.
func (k *Keeper) consumeBook(ctx context.Context, js jetstream.JetStream) {
	for {
		c, err := js.OrderedConsumer(ctx, bus.EngineOutStream, jetstream.OrderedConsumerConfig{
			FilterSubjects: []string{bus.EngineOutBook},
		})
		var cc jetstream.ConsumeContext
		if err == nil {
			cc, err = c.Consume(k.onBook)
		}
		if err == nil {
			<-ctx.Done()
			cc.Stop()
			return
		}
		slog.Warn("keeper: book consumer", "err", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(k.set.PollEvery):
		}
	}
}

// publishMarks sends the oracle index (USDC 1e6) as engine MarkPrice; engine needs it for margin.
func publishMarks(ctx context.Context, js jetstream.JetStream, prices map[uint32]int64) {
	for _, u := range markUpdates(prices) {
		b, _ := proto.Marshal(u)
		if _, err := js.Publish(ctx, bus.EngineInChain, b); err != nil {
			slog.Warn("keeper: publish mark", "market", u.GetMark().Market, "err", err)
		}
	}
}

func markUpdates(prices map[uint32]int64) (out []*perpv1.ChainUpdate) {
	for m, p := range prices {
		if p > 0 {
			out = append(out, &perpv1.ChainUpdate{Update: &perpv1.ChainUpdate_Mark{Mark: &perpv1.MarkPrice{Market: m, Price: uint64(p)}}})
		}
	}
	return out
}

func (k *Keeper) onBook(m jetstream.Msg) {
	var out perpv1.EngineOutput
	if err := proto.Unmarshal(m.Data(), &out); err != nil {
		slog.Warn("keeper: bad book msg", "err", err)
		return
	}
	if d := out.GetBook(); d != nil {
		k.Marks.OnBook(d, time.Now())
	}
}
