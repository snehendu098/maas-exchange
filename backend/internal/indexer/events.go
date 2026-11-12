package indexer

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// Op is one SQL statement derived from an event.
type Op struct {
	SQL  string
	Args []any
}

// Contracts are the executors whose logs are indexed.
type Contracts struct{ Exchange, Vault string }

// Mapper turns NEP-297 events into SQL ops. Pure: no db, no http.
type Mapper struct {
	c       Contracts
	symbols map[uint32]string
}

func NewMapper(c Contracts, symbols map[uint32]string) *Mapper { return &Mapper{c, symbols} }

const (
	stdExchange = "maas-exchange"
	stdVault    = "maas-vault"
)

const (
	sqlCollateral = `INSERT INTO collateral_updates VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`
	sqlBalance    = `INSERT INTO balances VALUES ($1,$2,$3)
		ON CONFLICT (account) DO UPDATE SET collateral=excluded.collateral, updated_block=excluded.updated_block`
	sqlPosUpdate = `INSERT INTO position_updates VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`
	sqlPosition  = `INSERT INTO positions VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (account, market_id) DO UPDATE SET size=excluded.size,
		entry_notional=excluded.entry_notional, funding_index=excluded.funding_index, updated_block=excluded.updated_block`
	sqlFill          = `INSERT INTO fills VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`
	sqlOrder         = `INSERT INTO orders VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`
	sqlFunding       = `INSERT INTO funding_updates VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`
	sqlMarketFunding = `UPDATE markets SET funding_index=$2 WHERE id=$1`
	// one row per open position; Δindex = rate*price, ceil(size*Δindex/1e26)
	sqlFundingPayments = `INSERT INTO funding_payments
		SELECT account, market_id, $1::bigint, $2::int, size, $4::numeric,
			div(x, 1e26) + CASE WHEN x > 0 AND mod(x, 1e26) <> 0 THEN 1 ELSE 0 END, $6::timestamptz
		FROM (SELECT *, size * $5::numeric AS x FROM positions WHERE market_id = $3::int AND size <> 0) p
		ON CONFLICT DO NOTHING`
	sqlLiquidation = `INSERT INTO liquidations VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`
	sqlMarket      = `INSERT INTO markets (id, symbol, feed_id, tick, lot, imr_bps, mmr_bps) VALUES ($1,$2,'',$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET symbol=COALESCE(NULLIF(excluded.symbol,''), markets.symbol), tick=excluded.tick,
		lot=excluded.lot, imr_bps=excluded.imr_bps, mmr_bps=excluded.mmr_bps`
	sqlVaultEvent = `INSERT INTO vault_events VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`
)

// Loc is where an event data item sits; Index counts indexed items within the block.
type Loc struct {
	Block uint64
	Index uint32
	Tx    string
	Time  time.Time
}

// event is a NEP-297 log body.
type event struct {
	Standard string            `json:"standard"`
	Event    string            `json:"event"`
	Data     []json.RawMessage `json:"data"`
}

// Block returns ops for every exchange/vault event in successful receipts of b.
func (m *Mapper) Block(b *Block) ([]Op, error) {
	var ops []Op
	var idx uint32
	for _, s := range b.Shards {
		for _, o := range s.Outcomes {
			std := m.standard(o.Exec.Outcome.ExecutorID)
			if std == "" || o.Failed() {
				continue
			}
			for _, l := range o.Exec.Outcome.Logs {
				body, ok := strings.CutPrefix(l, "EVENT_JSON:")
				if !ok {
					continue
				}
				var e event
				if json.Unmarshal([]byte(body), &e) != nil || e.Standard != std {
					continue // foreign standard, e.g. nep141 from vault share token
				}
				for _, d := range e.Data {
					loc := Loc{b.Height(), idx, o.TxHash, b.Time()}
					idx++
					op, err := m.mapOne(std, e.Event, d, loc)
					if err != nil {
						return nil, fmt.Errorf("block %d %s.%s: %w", loc.Block, std, e.Event, err)
					}
					ops = append(ops, op...)
				}
			}
		}
	}
	return ops, nil
}

func (m *Mapper) standard(executor string) string {
	switch executor {
	case "":
		return ""
	case m.c.Exchange:
		return stdExchange
	case m.c.Vault:
		return stdVault
	}
	return ""
}

func (m *Mapper) mapOne(std, name string, d json.RawMessage, l Loc) ([]Op, error) {
	if std == stdVault {
		return []Op{{sqlVaultEvent, []any{l.Block, l.Index, l.Tx, l.Time, name, string(d)}}}, nil
	}
	b, i := l.Block, l.Index
	switch name {
	case "deposited", "withdrawn", "collateral_updated":
		var e struct {
			AccountID  string      `json:"account_id"`
			Collateral json.Number `json:"collateral"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		return collateralOps(b, i, e.AccountID, e.Collateral), nil
	case "position_updated":
		var e struct {
			AccountID     string      `json:"account_id"`
			MarketID      uint32      `json:"market_id"`
			Size          json.Number `json:"size"`
			EntryNotional json.Number `json:"entry_notional"`
			FundingIndex  json.Number `json:"funding_index"`
			RealizedPnl   json.Number `json:"realized_pnl"`
			FundingPaid   json.Number `json:"funding_paid"`
			Collateral    json.Number `json:"collateral"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		a := e.AccountID
		return append([]Op{
			{sqlPosUpdate, []any{b, i, a, e.MarketID, e.Size.String(), e.EntryNotional.String(), e.FundingIndex.String(), e.RealizedPnl.String(), e.FundingPaid.String()}},
			{sqlPosition, []any{a, e.MarketID, e.Size.String(), e.EntryNotional.String(), e.FundingIndex.String(), b}},
		}, collateralOps(b, i, a, e.Collateral)...), nil
	case "traded":
		var e struct {
			MarketID       uint32      `json:"market_id"`
			MakerOrderHash string      `json:"maker_order_hash"`
			TakerOrderHash string      `json:"taker_order_hash"`
			Maker          string      `json:"maker"`
			Taker          string      `json:"taker"`
			TakerIsBuy     bool        `json:"taker_is_buy"`
			Price          json.Number `json:"price"`
			Size           json.Number `json:"size"`
			MakerFee       json.Number `json:"maker_fee"`
			TakerFee       json.Number `json:"taker_fee"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		return []Op{{sqlFill, []any{b, i, l.Tx, l.Time, e.MarketID, e.MakerOrderHash, e.TakerOrderHash,
			e.Maker, e.Taker, e.TakerIsBuy, e.Price.String(), e.Size.String(), e.MakerFee.String(), e.TakerFee.String()}}}, nil
	case "order_cancelled":
		var e struct {
			Trader    string `json:"trader"`
			OrderHash string `json:"order_hash"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		return []Op{{sqlOrder, []any{b, i, e.OrderHash, e.Trader}}}, nil
	case "funding_updated":
		var e struct {
			MarketID uint32      `json:"market_id"`
			Rate     json.Number `json:"rate"`
			Price    json.Number `json:"price"`
			Index    json.Number `json:"index"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		delta, err := mul(e.Rate, e.Price)
		if err != nil {
			return nil, err
		}
		return []Op{
			{sqlFunding, []any{b, i, e.MarketID, e.Rate.String(), e.Price.String(), e.Index.String(), l.Time}},
			{sqlFundingPayments, []any{b, i, e.MarketID, e.Rate.String(), delta, l.Time}},
			{sqlMarketFunding, []any{e.MarketID, e.Index.String()}},
		}, nil
	case "liquidated":
		var e struct {
			AccountID  string      `json:"account_id"`
			MarketID   uint32      `json:"market_id"`
			Liquidator string      `json:"liquidator"`
			Price      json.Number `json:"price"`
			Size       json.Number `json:"size"`
			Penalty    json.Number `json:"penalty"`
			BadDebt    json.Number `json:"bad_debt"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		return []Op{{sqlLiquidation, []any{b, i, e.AccountID, e.MarketID, e.Liquidator,
			e.Price.String(), e.Size.String(), e.Penalty.String(), e.BadDebt.String()}}}, nil
	case "market_set":
		var e struct {
			MarketID uint32 `json:"market_id"`
			Market   struct {
				TickSize json.Number `json:"tick_size"`
				LotSize  json.Number `json:"lot_size"`
				ImrBps   json.Number `json:"imr_bps"`
				MmrBps   json.Number `json:"mmr_bps"`
			} `json:"market"`
		}
		if err := json.Unmarshal(d, &e); err != nil {
			return nil, err
		}
		mk := e.Market
		return []Op{{sqlMarket, []any{e.MarketID, m.symbols[e.MarketID], mk.TickSize.String(), mk.LotSize.String(),
			mk.ImrBps.String(), mk.MmrBps.String()}}}, nil
	}
	return nil, nil // price_pushed etc: not persisted
}

func collateralOps(b uint64, i uint32, acct string, c json.Number) []Op {
	return []Op{
		{sqlCollateral, []any{b, i, acct, c.String()}},
		{sqlBalance, []any{acct, c.String(), b}},
	}
}

func mul(a, b json.Number) (string, error) {
	x, ok1 := new(big.Int).SetString(a.String(), 10)
	y, ok2 := new(big.Int).SetString(b.String(), 10)
	if !ok1 || !ok2 {
		return "", fmt.Errorf("bad int %q * %q", a, b)
	}
	return x.Mul(x, y).String(), nil
}
