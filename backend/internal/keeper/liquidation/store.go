package liquidation

import (
	"context"
	"fmt"
	"math/big"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PG reads accounts and markets from the indexer's Postgres read model.
type PG struct{ Pool *pgxpool.Pool }

// Accounts returns every account with an open position.
func (s PG) Accounts(ctx context.Context) ([]Account, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT p.account, COALESCE(b.collateral, 0)::text, p.market_id,
		       p.size::text, p.entry_notional::text, p.funding_index::text
		FROM positions p LEFT JOIN balances b USING (account)
		WHERE p.size <> 0 ORDER BY p.account`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Account
	for rows.Next() {
		var addr, coll, size, entry, idx string
		var p Position
		if err := rows.Scan(&addr, &coll, &p.Market, &size, &entry, &idx); err != nil {
			return nil, err
		}
		if len(out) == 0 || out[len(out)-1].Addr != addr {
			c, err := num(coll)
			if err != nil {
				return nil, err
			}
			out = append(out, Account{Addr: addr, Collateral: c})
		}
		if p.Size, err = num(size); err != nil {
			return nil, err
		}
		if p.EntryNotional, err = num(entry); err != nil {
			return nil, err
		}
		if p.FundingIndex, err = num(idx); err != nil {
			return nil, err
		}
		a := &out[len(out)-1]
		a.Positions = append(a.Positions, p)
	}
	return out, rows.Err()
}

// Markets returns risk params by market id.
func (s PG) Markets(ctx context.Context) (map[uint32]Market, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id, mmr_bps, funding_index::text FROM markets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uint32]Market{}
	for rows.Next() {
		var id uint32
		var m Market
		var idx string
		if err := rows.Scan(&id, &m.MMRBps, &idx); err != nil {
			return nil, err
		}
		if m.FundingIndex, err = num(idx); err != nil {
			return nil, err
		}
		out[id] = m
	}
	return out, rows.Err()
}

func num(s string) (*big.Int, error) {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return nil, fmt.Errorf("liquidation: bad numeric %q", s)
	}
	return n, nil
}
