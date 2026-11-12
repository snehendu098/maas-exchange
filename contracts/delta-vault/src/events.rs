use near_sdk::log;
use near_sdk::serde_json::{json, Value};

/// NEP-297 log, standard "maas-vault".
pub fn emit(event: &str, data: Value) {
    let e = json!({"standard": "maas-vault", "version": "1.0.0", "event": event, "data": [data]});
    log!("EVENT_JSON:{}", e);
}
