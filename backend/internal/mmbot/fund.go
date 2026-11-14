package mmbot

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"slices"

	"maas/backend/internal/platform/near"
)

// Fund registers the signer's key as trading key, then deposits deposit6 USDC
// (ft_transfer_call) when exchange collateral < min6.
func Fund(ctx context.Context, sg *near.Signer, exchange, usdc string, min6, deposit6 float64) error {
	pk := near.PublicKeyString(sg.PublicKey())
	acct := map[string]any{"account_id": sg.Account}
	var keys []string
	if err := sg.Client.View(ctx, exchange, "trading_keys", acct, &keys); err != nil {
		return err
	}
	if !slices.Contains(keys, pk) {
		if _, err := sg.Call(ctx, exchange, near.FunctionCall{Method: "add_trading_key",
			Args: near.Args(map[string]any{"public_key": pk}), Gas: 30 * near.TGas, Deposit: near.OneYocto}); err != nil {
			return fmt.Errorf("mmbot: add_trading_key: %w", err)
		}
		slog.Info("mmbot: trading key added", "account", sg.Account)
	}
	var col string
	if err := sg.Client.View(ctx, exchange, "collateral", acct, &col); err != nil {
		return err
	}
	c, _ := new(big.Int).SetString(col, 10)
	if c != nil && c.Cmp(units(min6)) >= 0 {
		slog.Info("mmbot: collateral ok", "account", sg.Account, "collateral", col)
		return nil
	}
	amt := units(deposit6)
	var bal string
	if err := sg.Client.View(ctx, usdc, "ft_balance_of", acct, &bal); err != nil {
		return err
	}
	if b, _ := new(big.Int).SetString(bal, 10); b == nil || b.Cmp(amt) < 0 {
		return fmt.Errorf("mmbot: %s has %s USDC units, need %s", sg.Account, bal, amt)
	}
	if _, err := sg.Call(ctx, usdc, near.FunctionCall{Method: "ft_transfer_call",
		Args: near.Args(map[string]any{"receiver_id": exchange, "amount": amt.String(), "msg": ""}), Gas: 100 * near.TGas, Deposit: near.OneYocto}); err != nil {
		return fmt.Errorf("mmbot: deposit: %w", err)
	}
	slog.Info("mmbot: deposited", "account", sg.Account, "amount", amt)
	return nil
}

func units(v float64) *big.Int { b, _ := big.NewFloat(v).Int(nil); return b }
