// Package alert posts vaultkeeper alerts to a webhook as JSON.
package alert

import (
	"context"
	"log/slog"

	"maas/backend/internal/platform/gwclient"
	vk "maas/backend/internal/vaultkeeper"
)

// Webhook POSTs {level, market, msg}; failures are logged, never block the keeper.
type Webhook struct {
	C gwclient.Client // Base = full URL, path ""
}

func (w Webhook) Alert(ctx context.Context, a vk.Alert) {
	body := map[string]any{"service": "vault-keeper", "level": a.Level.String(), "market": a.Market, "msg": a.Msg}
	if err := w.C.Do(ctx, "POST", "", body, nil); err != nil {
		slog.Warn("vaultkeeper: alert webhook", "err", err)
	}
}
