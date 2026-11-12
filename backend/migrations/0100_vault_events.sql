-- maas-vault event history; data = raw NEP-297 data item.
CREATE TABLE vault_events (
    block_number BIGINT NOT NULL,
    log_index    INT NOT NULL,
    tx_hash      TEXT NOT NULL,
    block_time   TIMESTAMPTZ NOT NULL,
    event        TEXT NOT NULL,
    data         JSONB NOT NULL,
    PRIMARY KEY (block_number, log_index)
);
CREATE INDEX ON vault_events (event, block_number DESC);
