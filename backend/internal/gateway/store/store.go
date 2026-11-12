// Package store reads the indexer's Postgres read model and exchange views.
package store

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"maas/backend/internal/gateway/api"
	"maas/backend/internal/platform/config"
	"maas/backend/internal/platform/near"
)

type Store struct {
	Pool     *pgxpool.Pool
	Chain    *near.Client
	Exchange string
}

// MarketView is the exchange `market` view.
type MarketView struct {
	TickSize    string `json:"tick_size"`
	LotSize     string `json:"lot_size"`
	ImrBps      uint64 `json:"imr_bps"`
	MmrBps      uint64 `json:"mmr_bps"`
	MakerFeeBps uint64 `json:"maker_fee_bps"`
	TakerFeeBps uint64 `json:"taker_fee_bps"`
}

// Markets loads market params from chain (db lacks fees). shortcut: boot-only, restart after set_market.
func (s *Store) Markets(ctx context.Context, ms []config.Market) (map[uint32]api.Market, error) {
	out := map[uint32]api.Market{}
	for _, m := range ms {
		var p *MarketView
		if err := s.Chain.View(ctx, s.Exchange, "market", map[string]any{"market_id": m.ID}, &p); err != nil {
			return nil, err
		}
		if p == nil {
			return nil, fmt.Errorf("store: market %d not set onchain", m.ID)
		}
		tick, _ := strconv.ParseUint(p.TickSize, 10, 64)
		lot, _ := strconv.ParseUint(p.LotSize, 10, 64)
		out[m.ID] = api.Market{
			ID: m.ID, Symbol: m.Symbol, TickSize: p.TickSize, LotSize: p.LotSize,
			ImrBps: p.ImrBps, MmrBps: p.MmrBps, MakerFeeBps: p.MakerFeeBps, TakerFeeBps: p.TakerFeeBps, Tick: tick, Lot: lot,
		}
	}
	return out, nil
}

// Account is live chain views (collateral, equity, margins).
func (s *Store) Account(ctx context.Context, trader string) (api.Account, error) {
	a := api.Account{Trader: trader}
	arg := map[string]any{"account_id": trader}
	var m struct{ Im, Mm string }
	for _, v := range []struct {
		method string
		out    any
	}{{"collateral", &a.Collateral}, {"equity", &a.Equity}, {"margins", &m}} {
		if err := s.Chain.View(ctx, s.Exchange, v.method, arg, v.out); err != nil {
			return api.Account{}, err
		}
	}
	a.InitialMargin, a.MaintenanceMargin = m.Im, m.Mm
	return a, nil
}

// TradingKeys lists the trader's registered ed25519 order keys.
func (s *Store) TradingKeys(ctx context.Context, trader string) ([]string, error) {
	var ks []string
	err := s.Chain.View(ctx, s.Exchange, "trading_keys", map[string]any{"account_id": trader}, &ks)
	return ks, err
}

const sqlPositions = `
SELECT p.account, p.market_id, p.size::text, p.entry_notional::text,
  COALESCE((SELECT sum(u.realized_pnl) FROM position_updates u WHERE u.account = p.account AND u.market_id = p.market_id), 0)::text
FROM positions p WHERE p.account = $1 `

// Positions lists open positions.
func (s *Store) Positions(ctx context.Context, trader string) ([]api.Position, error) {
	return s.positions(ctx, sqlPositions+`AND p.size <> 0 ORDER BY p.market_id`, trader)
}

// Position is one market's position, size 0 if flat (WS event).
func (s *Store) Position(ctx context.Context, trader string, market int) (api.Position, error) {
	ps, err := s.positions(ctx, sqlPositions+`AND p.market_id = $2`, trader, market)
	if err != nil || len(ps) == 0 {
		return api.Position{Trader: trader, Market: uint32(market), Size: "0", EntryNotional: "0", RealizedPnl: "0"}, err
	}
	return ps[0], nil
}

func (s *Store) positions(ctx context.Context, q string, args ...any) ([]api.Position, error) {
	rows, _ := s.Pool.Query(ctx, q, args...)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (p api.Position, err error) {
		return p, r.Scan(&p.Trader, &p.Market, &p.Size, &p.EntryNotional, &p.RealizedPnl)
	})
}

// Funding: per-period accruals (indexer funding_payments), newest first. Settled onchain lazily.
const sqlFunding = `
SELECT market_id, rate::text, size::text, amount::text, (extract(epoch FROM block_time) * 1000)::bigint, block_number
FROM funding_payments WHERE account = $1 ORDER BY block_number DESC, log_index DESC LIMIT 100`

func (s *Store) Funding(ctx context.Context, trader string) ([]api.FundingPayment, error) {
	rows, _ := s.Pool.Query(ctx, sqlFunding, trader)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (f api.FundingPayment, err error) {
		return f, r.Scan(&f.Market, &f.Rate, &f.PositionSize, &f.Payment, &f.Time, &f.Block)
	})
}

const sqlFundingRates = `
SELECT extract(epoch FROM block_time)::bigint, rate::text, block_number, log_index
FROM funding_updates WHERE market_id = $1 AND block_time >= $2 ORDER BY block_number, log_index`

// FundingRates is a market's prints since `since`, oldest first.
func (s *Store) FundingRates(ctx context.Context, market uint32, since time.Time) ([]api.FundingRate, error) {
	rows, _ := s.Pool.Query(ctx, sqlFundingRates, market, since)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (f api.FundingRate, err error) {
		return f, r.Scan(&f.Time, &f.Rate, &f.Block, &f.LogIndex)
	})
}

// Intervals the client asks for (types.ts CandleInterval).
var Intervals = map[string]time.Duration{
	"1m": time.Minute, "5m": 5 * time.Minute, "15m": 15 * time.Minute, "1h": time.Hour, "4h": 4 * time.Hour, "1d": 24 * time.Hour,
}

// Candles bins settled fills on the fly (any interval; indexer's candles table only has 1m/5m/1h).
// shortcut: scans market fills per call, read candles table if it gets slow.
const sqlCandles = `
SELECT extract(epoch FROM b)::bigint, (array_agg(price ORDER BY block_number, log_index))[1]::text,
  max(price)::text, min(price)::text, (array_agg(price ORDER BY block_number DESC, log_index DESC))[1]::text, sum(size)::text
FROM (SELECT date_bin($2::interval, block_time, 'epoch'::timestamptz) AS b, * FROM fills WHERE market_id = $1) f
GROUP BY b ORDER BY b DESC LIMIT $3`

func (s *Store) Candles(ctx context.Context, market uint32, iv time.Duration, limit int) ([]api.Candle, error) {
	rows, _ := s.Pool.Query(ctx, sqlCandles, market, iv, limit)
	cs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (c api.Candle, err error) {
		return c, r.Scan(&c.Time, &c.Open, &c.High, &c.Low, &c.Close, &c.Volume)
	})
	for i, j := 0, len(cs)-1; i < j; i, j = i+1, j-1 {
		cs[i], cs[j] = cs[j], cs[i]
	}
	return cs, err
}

const sqlStats = `
SELECT m.id,
  COALESCE((SELECT price FROM fills f WHERE f.market_id = m.id AND f.block_time >= now() - interval '24 hours'
    ORDER BY block_number, log_index LIMIT 1), 0)::text,
  COALESCE((SELECT sum(size) FROM fills f WHERE f.market_id = m.id AND f.block_time >= now() - interval '24 hours'), 0)::text,
  COALESCE((SELECT sum(size) FROM positions p WHERE p.market_id = m.id AND p.size > 0), 0)::text,
  COALESCE((SELECT rate FROM funding_updates u WHERE u.market_id = m.id ORDER BY block_number DESC, log_index DESC LIMIT 1), 0)::text
FROM unnest($1::int[]) AS m(id) ORDER BY m.id`

// Stats fills the db-backed fields (open24h, volume24h, OI, funding rate).
func (s *Store) Stats(ctx context.Context, ids []uint32) ([]api.MarketStats, error) {
	rows, _ := s.Pool.Query(ctx, sqlStats, ids)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (m api.MarketStats, err error) {
		return m, r.Scan(&m.Market, &m.Open24h, &m.Volume24h, &m.OpenInterest, &m.FundingRate)
	})
}

// AccountID returns a if it is a valid NEAR account id, else "".
func AccountID(a string) string {
	if !near.ValidAccountID(a) {
		return ""
	}
	return a
}

// window starts at a time; position_updates has no timestamp, so they take their block's fill time.
// curve = 24 equal buckets of cumulative realized - fees across the window (from first fill for "all").
// shortcut: mark = last trade price per market; one full scan per call (fine at testnet size, cache if it grows).
const sqlLeaderboard = `
WITH bt AS (SELECT DISTINCT block_number, block_time FROM fills),
win AS (SELECT GREATEST($1::timestamptz, min(block_time)) AS s, now() AS e FROM fills),
mark AS (SELECT DISTINCT ON (market_id) market_id, price FROM fills ORDER BY market_id, block_number DESC, log_index DESC),
side AS (
  SELECT maker AS account, market_id, block_time AS t, price * size / 100000000 AS q, maker_fee AS fee FROM fills WHERE block_time >= $1
  UNION ALL
  SELECT taker, market_id, block_time, price * size / 100000000, taker_fee FROM fills WHERE block_time >= $1),
pu AS (SELECT p.account, p.realized_pnl AS r, bt.block_time AS t FROM position_updates p JOIN bt USING (block_number) WHERE bt.block_time >= $1),
vol AS (SELECT account, sum(q) AS v, sum(fee) AS fee, count(*) AS n, array_agg(DISTINCT market_id ORDER BY market_id) AS mk FROM side GROUP BY account),
rl AS (SELECT account, sum(r) AS r, count(*) FILTER (WHERE r > 0) AS w, count(*) FILTER (WHERE r <> 0) AS c FROM pu GROUP BY account),
fd AS (SELECT account, sum(amount) AS f FROM funding_payments WHERE block_time >= $1 GROUP BY account),
up AS (SELECT p.account, sum(sign(p.size) * (abs(p.size) * m.price / 100000000 - p.entry_notional)) AS u
       FROM positions p JOIN mark m USING (market_id) WHERE p.size <> 0 GROUP BY p.account),
ev AS (SELECT account, t, r AS d FROM pu UNION ALL SELECT account, t, -fee FROM side),
bk AS (SELECT ev.account, LEAST(23, floor(extract(epoch FROM ev.t - win.s) * 24 / GREATEST(extract(epoch FROM win.e - win.s), 1)))::int AS i, sum(d) AS d
       FROM ev, win GROUP BY 1, 2),
cum AS (SELECT a.account, g.i, sum(COALESCE(bk.d, 0)) OVER (PARTITION BY a.account ORDER BY g.i) AS c
        FROM vol a CROSS JOIN generate_series(0, 23) AS g(i) LEFT JOIN bk ON bk.account = a.account AND bk.i = g.i),
cv AS (SELECT account, array_agg(trunc(c)::text ORDER BY i) AS curve FROM cum GROUP BY account),
t AS (SELECT v.account, COALESCE(rl.r, 0) AS r, COALESCE(up.u, 0) AS u, v.fee, COALESCE(fd.f, 0) AS f, v.v, v.n, v.mk,
             COALESCE(b.collateral, 0) + COALESCE(up.u, 0) AS eq, COALESCE(rl.w, 0) AS w, COALESCE(rl.c, 0) AS c
      FROM vol v LEFT JOIN rl USING (account) LEFT JOIN fd USING (account) LEFT JOIN up USING (account)
      LEFT JOIN balances b USING (account)
      WHERE v.account <> ALL($2))
SELECT account, trunc(r - fee - f + u)::text, trunc(r)::text, trunc(u)::text, trunc(fee)::text, trunc(f)::text, trunc(v)::text, n,
       trunc(eq)::text, CASE WHEN t.c > 0 THEN t.w::float8 / t.c ELSE 0 END, mk, curve
FROM t JOIN cv USING (account)
ORDER BY r - fee - f + u DESC LIMIT 100`

// Leaderboard ranks traders by PnL since `since`; exclude = account ids (mm-bot).
func (s *Store) Leaderboard(ctx context.Context, since time.Time, exclude []string) ([]api.LeaderRow, error) {
	if exclude == nil {
		exclude = []string{}
	}
	rows, _ := s.Pool.Query(ctx, sqlLeaderboard, since, exclude)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (l api.LeaderRow, err error) {
		return l, r.Scan(&l.Trader, &l.Pnl, &l.Realized, &l.Unrealized, &l.Fees, &l.Funding, &l.Volume, &l.Trades,
			&l.Equity, &l.WinRate, &l.Markets, &l.Curve)
	})
}
