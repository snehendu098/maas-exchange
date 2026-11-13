use async_nats::jetstream::{consumer::pull, consumer::DeliverPolicy, stream};

// declarative defs in infra/nats are the single source of truth
const ENGINE_IN: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../infra/nats/engine_in.stream.json"
));
const ENGINE_OUT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../infra/nats/engine_out.stream.json"
));
const CONSUMER: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../infra/nats/engine.consumer.json"
));

pub fn engine_in() -> stream::Config {
    serde_json::from_str(ENGINE_IN).expect("valid engine_in.stream.json")
}

pub fn engine_out() -> stream::Config {
    serde_json::from_str(ENGINE_OUT).expect("valid engine_out.stream.json")
}

pub fn consumer(start_seq: u64) -> pull::Config {
    let mut cfg: pull::Config = serde_json::from_str(CONSUMER).expect("valid engine.consumer.json");
    cfg.deliver_policy = DeliverPolicy::ByStartSequence {
        start_sequence: start_seq,
    };
    cfg
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defs_parse() {
        assert_eq!(engine_in().name, "ENGINE_IN");
        assert_eq!(engine_in().subjects, ["engine.in.>"]);
        assert_eq!(engine_out().subjects, ["engine.out.>"]);
        let c = consumer(9);
        assert_eq!(c.max_ack_pending, 1);
        assert_eq!(c.durable_name.as_deref(), Some("engine"));
        assert_eq!(
            c.deliver_policy,
            DeliverPolicy::ByStartSequence { start_sequence: 9 }
        );
    }
}
