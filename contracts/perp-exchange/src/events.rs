use near_sdk::serde_json::{json, Value};
use near_sdk::{log, AccountId};

/// NEP-297 log. Numbers in `data` are passed as decimal strings by callers.
pub fn emit(event: &str, data: Value) {
    let e =
        json!({"standard": "maas-exchange", "version": "1.0.0", "event": event, "data": [data]});
    log!("EVENT_JSON:{}", e);
}

pub fn collateral_updated(account_id: &AccountId, collateral: i128) {
    emit(
        "collateral_updated",
        json!({"account_id": account_id, "collateral": collateral.to_string()}),
    );
}
