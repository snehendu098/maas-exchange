-- Shared read model. Keeper reads these; column names are a contract.
CREATE TABLE markets (
    id            INT PRIMARY KEY,
    symbol        TEXT NOT NULL,
    feed_id       TEXT NOT NULL,
    tick          NUMERIC NOT NULL,
    lot           NUMERIC NOT NULL,
    imr_bps       INT NOT NULL,
    mmr_bps       INT NOT NULL,
    funding_index NUMERIC NOT NULL DEFAULT 0
);

-- account = NEAR account id; size signed base 1e8; entry_notional USDC 1e6.
CREATE TABLE positions (
    account        TEXT NOT NULL,
    market_id      INT NOT NULL,
    size           NUMERIC NOT NULL,
    entry_notional NUMERIC NOT NULL,
    funding_index  NUMERIC NOT NULL,
    updated_block  BIGINT NOT NULL,
    PRIMARY KEY (account, market_id)
);

CREATE TABLE balances (
    account       TEXT PRIMARY KEY,
    collateral    NUMERIC NOT NULL,
    updated_block BIGINT NOT NULL
);

-- Indexed final block heights; max(number) = cursor.
CREATE TABLE blocks (
    number BIGINT PRIMARY KEY,
    hash   TEXT NOT NULL
);
-- Range snapshots and rollback filter on updated_block.
CREATE INDEX ON balances (updated_block);
CREATE INDEX ON positions (updated_block);
