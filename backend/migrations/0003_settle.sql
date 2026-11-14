-- Settler idempotency. status: sent (tx in flight) -> mined -> published.
-- raw_tx = signed tx, rebroadcast as-is on restart (same hash); block_number = tx block.
CREATE TABLE settle_batches (
    id           TEXT PRIMARY KEY,
    status       TEXT NOT NULL,
    nonce        BIGINT,
    raw_tx       BYTEA,
    tx_hash      TEXT,
    block_number BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per engine fill ever handled; ok NULL while its batch tx is in flight.
CREATE TABLE settled_fills (
    market   INT NOT NULL,
    trade_id BIGINT NOT NULL,
    batch_id TEXT NOT NULL REFERENCES settle_batches ON DELETE CASCADE,
    ok       BOOLEAN,
    PRIMARY KEY (market, trade_id)
);
