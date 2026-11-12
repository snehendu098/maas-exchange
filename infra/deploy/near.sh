#!/usr/bin/env bash
# deploy perp-exchange + delta-vault as sub-accounts of NEAR_MASTER_ACCOUNT, then init.
# needs near-cli-rs (`near`), master key in keychain, wasm built (make wasm). re-run skips existing accounts.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a

NET=${NEAR_NETWORK:-testnet}
MASTER=${NEAR_MASTER_ACCOUNT:?set NEAR_MASTER_ACCOUNT (funded, key in keychain)}
USDC=${USDC_CONTRACT:?set USDC_CONTRACT}
WASM_DIR=${WASM_DIR:-contracts/target/near}
EXCHANGE=${EXCHANGE_CONTRACT:-exchange.$MASTER}
VAULT=${VAULT_CONTRACT:-vault.$MASTER}
OPERATOR=${OPERATOR_ACCOUNT_ID:-$MASTER}
KEEPER=${KEEPER_ACCOUNT_ID:-$MASTER}
FUND=${SUB_ACCOUNT_FUND:-10 NEAR}
TAIL=(network-config "$NET" sign-with-keychain send)

exists() { near account view-account-summary "$1" network-config "$NET" now >/dev/null 2>&1; }

sub_account() {
  exists "$1" && { echo "skip create $1"; return; }
  near account create-account fund-myself "$1" "$FUND" autogenerate-new-keypair save-to-keychain \
    sign-as "$MASTER" "${TAIL[@]}"
}

deploy() { # account wasm init-json
  near contract deploy "$1" use-file "$WASM_DIR/$2" with-init-call new json-args "$3" \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' "${TAIL[@]}"
}

# contract must hold a usdc storage slot to receive ft_transfer_call
usdc_register() {
  near contract call-function as-transaction "$USDC" storage_deposit json-args "{\"account_id\":\"$1\"}" \
    prepaid-gas '30 Tgas' attached-deposit '0.0125 NEAR' sign-as "$MASTER" "${TAIL[@]}"
}

for a in "$EXCHANGE" "$VAULT"; do sub_account "$a"; done

deploy "$EXCHANGE" perp_exchange.wasm "{\"owner\":\"$MASTER\",\"operator\":\"$OPERATOR\",\"keeper\":\"$KEEPER\",\
\"fee_recipient\":\"${FEE_RECIPIENT:-$MASTER}\",\"insurance\":\"${INSURANCE_ACCOUNT:-$MASTER}\",\"usdc\":\"$USDC\",\
\"max_price_age_ms\":${MAX_PRICE_AGE_MS:-60000}}"

[ "$NET" = mainnet ] && REF_DEFAULT=v2.ref-finance.near || REF_DEFAULT=ref-finance-101.testnet
VAULT_DEFAULT="{\"owner\":\"$MASTER\",\"keeper\":\"$KEEPER\",\"usdc\":\"$USDC\",\"exchange\":\"$EXCHANGE\",\
\"ref_exchange\":\"${REF_EXCHANGE:-$REF_DEFAULT}\"}"
# shortcut: vault init args guessed from spec, override with VAULT_INIT_ARGS until contract init is final
deploy "$VAULT" delta_vault.wasm "${VAULT_INIT_ARGS:-$VAULT_DEFAULT}"

for a in "$EXCHANGE" "$VAULT"; do usdc_register "$a"; done

echo "EXCHANGE_CONTRACT=$EXCHANGE"
echo "VAULT_CONTRACT=$VAULT"
