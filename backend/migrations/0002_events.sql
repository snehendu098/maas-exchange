-- Log-derived history. (block_number, log_index) makes replays idempotent;
-- log_index = event order within block.

-- Every event carrying absolute collateral; balances = latest row per account.
CREATE TABLE collateral_updates (
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    account      TEXT NOT NULL,
    collateral   NUMERIC NOT NULL,
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON collateral_updates (account, block_number DESC, log_index DESC);

-- position_updated history; positions = latest row per (account, market_id).
CREATE TABLE position_updates (
    block_number   BIGINT NOT NULL,
    log_index      INT NOT NULL,
    account        TEXT NOT NULL,
    market_id      INT NOT NULL,
    size           NUMERIC NOT NULL,
    entry_notional NUMERIC NOT NULL,
    funding_index  NUMERIC NOT NULL,
    realized_pnl   NUMERIC NOT NULL,
    funding_paid   NUMERIC NOT NULL,
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON position_updates (account, market_id, block_number DESC, log_index DESC);

CREATE TABLE fills (
    block_number     BIGINT NOT NULL,
    log_index        INT NOT NULL,
    tx_hash          TEXT NOT NULL,
    block_time       TIMESTAMPTZ NOT NULL,
    market_id        INT NOT NULL,
    maker_order_hash TEXT NOT NULL,
    taker_order_hash TEXT NOT NULL,
    maker            TEXT NOT NULL,
    taker            TEXT NOT NULL,
    taker_is_buy     BOOLEAN NOT NULL,
    price            NUMERIC NOT NULL,
    size             NUMERIC NOT NULL,
    maker_fee        NUMERIC NOT NULL,
    taker_fee        NUMERIC NOT NULL,
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON fills (market_id, block_time);

-- One settle tx = one batch.
CREATE VIEW batches AS
SELECT tx_hash, block_number, min(log_index) AS first_log_index, count(*) AS fill_count
FROM fills GROUP BY tx_hash, block_number;

-- Onchain order lifecycle: cancels only (fills live in fills).
CREATE TABLE orders (
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    order_hash   TEXT NOT NULL,
    trader       TEXT NOT NULL,
    cancelled    BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON orders (order_hash);

CREATE TABLE funding_updates (
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    market_id    INT NOT NULL,
    rate         NUMERIC NOT NULL,
    price        NUMERIC NOT NULL,
    index        NUMERIC NOT NULL,
    block_time   TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON funding_updates (market_id, block_time);

CREATE TABLE liquidations (
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    account      TEXT NOT NULL,
    market_id    INT NOT NULL,
    liquidator   TEXT NOT NULL,
    price        NUMERIC NOT NULL,
    size         NUMERIC NOT NULL,
    penalty      NUMERIC NOT NULL,
    bad_debt     NUMERIC NOT NULL,
    PRIMARY KEY (block_number, log_index)
);

-- Built from fills; recomputed per touched bucket.
CREATE TABLE candles (
    market_id    INT NOT NULL,
    interval     TEXT NOT NULL,
    bucket_start TIMESTAMPTZ NOT NULL,
    o            NUMERIC NOT NULL,
    h            NUMERIC NOT NULL,
    l            NUMERIC NOT NULL,
    c            NUMERIC NOT NULL,
    volume       NUMERIC NOT NULL,
    PRIMARY KEY (market_id, interval, bucket_start)
);

-- Per-period funding accrued by each open position at a funding_updated; > 0 = paid by account.
CREATE TABLE funding_payments (
    account      TEXT NOT NULL,
    market_id    INT NOT NULL,
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    size         NUMERIC NOT NULL,
    rate         NUMERIC NOT NULL,
    amount       NUMERIC NOT NULL,
    block_time   TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (block_number, log_index, account)
);
CREATE INDEX ON funding_payments (account, block_number DESC, log_index DESC);
