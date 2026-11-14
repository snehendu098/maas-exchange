#!/usr/bin/env bash
# deploy perp-exchange + delta-vault + maas-pool as sub-accounts of NEAR_MASTER_ACCOUNT, then init.
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
POOL=${POOL_CONTRACT:-pool.$MASTER}
OPERATOR=${OPERATOR_ACCOUNT_ID:-$MASTER}
KEEPER=${KEEPER_ACCOUNT_ID:-$MASTER}
FUND=${SUB_ACCOUNT_FUND:-10 NEAR}
# NEAR_KEYCHAIN=legacy uses ~/.near-credentials instead of the OS keychain
KC=${NEAR_KEYCHAIN:+${NEAR_KEYCHAIN}-}keychain
TAIL=(network-config "$NET" sign-with-$KC send)

exists() { near account view-account-summary "$1" network-config "$NET" now >/dev/null 2>&1; }

sub_account() {
  exists "$1" && { echo "skip create $1"; return; }
  near account create-account fund-myself "$1" "$FUND" autogenerate-new-keypair save-to-$KC \
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

for a in "$EXCHANGE" "$VAULT" "$POOL"; do sub_account "$a"; done

deploy "$EXCHANGE" perp_exchange.wasm "{\"owner\":\"$MASTER\",\"operator\":\"$OPERATOR\",\"keeper\":\"$KEEPER\",\
\"fee_recipient\":\"${FEE_RECIPIENT:-$MASTER}\",\"insurance\":\"${INSURANCE_ACCOUNT:-$MASTER}\",\"usdc\":\"$USDC\",\
\"max_price_age_ms\":${MAX_PRICE_AGE_MS:-60000}}"

# vault spot legs: base token + maas-pool id (= perp market id) per market (BTC, ETH, NEAR)
BASES=(${BASE_TOKENS:-wbtc.fakes.testnet weth.fakes.testnet wrap.testnet})
DECS=(${BASE_DECIMALS:-8 18 24})
VAULT_MARKETS=${VAULT_MARKETS:-"[{\"base_token\":\"${BASES[0]}\",\"base_decimals\":${DECS[0]},\"ref_pool_id\":0},{\"base_token\":\"${BASES[1]}\",\"base_decimals\":${DECS[1]},\"ref_pool_id\":1},{\"base_token\":\"${BASES[2]}\",\"base_decimals\":${DECS[2]},\"ref_pool_id\":2}]"}
VAULT_CONFIG=${VAULT_CONFIG:-'{"weights_bps":[5000,3000,2000],"short_leverage_bps":10000,"idle_buffer_bps":1000,"withdraw_fee_bps":10,"cooldown_ms":3600000,"price_band_bps":100,"slippage_bps":50,"size_cap":["1000000000","1000000000","1000000000"],"max_price_age_ms":60000}'}
VAULT_DEFAULT="{\"owner\":\"$MASTER\",\"keeper\":\"$KEEPER\",\"usdc\":\"$USDC\",\"exchange\":\"$EXCHANGE\",\
\"ref_exchange\":\"$POOL\",\"markets\":$VAULT_MARKETS,\"config\":$VAULT_CONFIG}"
deploy "$VAULT" delta_vault.wasm "${VAULT_INIT_ARGS:-$VAULT_DEFAULT}"

POOL_PARAMS=${POOL_PARAMS:-'{"base_fee_bps":3,"gap_share_bps":5000,"cap_bps":100,"stale_fee_bps":10,"max_price_age_ms":60000}'}
deploy "$POOL" maas_pool.wasm "{\"owner\":\"$MASTER\",\"keeper\":\"$KEEPER\",\"vault\":\"$VAULT\",\"usdc\":\"$USDC\",\"params\":$POOL_PARAMS}"

call() { # contract method json [deposit]
  near contract call-function as-transaction "$1" "$2" json-args "$3" \
    prepaid-gas '30 Tgas' attached-deposit "${4:-0 NEAR}" sign-as "$MASTER" "${TAIL[@]}"
}
for i in 0 1 2; do call "$POOL" add_pool "{\"base\":\"${BASES[$i]}\",\"base_decimals\":${DECS[$i]}}"; done

for a in "$EXCHANGE" "$VAULT" "$POOL"; do usdc_register "$a"; done
# pool + vault hold base tokens
for t in "${BASES[@]}"; do for a in "$POOL" "$VAULT"; do
  call "$t" storage_deposit "{\"account_id\":\"$a\"}" '0.0125 NEAR'
done; done
call "$EXCHANGE" set_fee_exempt "{\"account_id\":\"$VAULT\",\"exempt\":true}"

# markets: (id tick lot imr mmr), must match engine default_markets
set_market() {
  near contract call-function as-transaction "$EXCHANGE" set_market json-args \
    "{\"market_id\":$1,\"market\":{\"tick_size\":\"$2\",\"lot_size\":\"$3\",\"max_leverage\":$((10000 / $4)),\"imr_bps\":$4,\"mmr_bps\":$5,\"maker_fee_bps\":${MAKER_FEE_BPS:-2},\"taker_fee_bps\":${TAKER_FEE_BPS:-5}}}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$MASTER" "${TAIL[@]}"
}
set_market 0 100000 10000 500 250
set_market 1 10000 100000 500 250
set_market 2 1000 1000000 1000 500

echo "EXCHANGE_CONTRACT=$EXCHANGE"
echo "VAULT_CONTRACT=$VAULT"
echo "POOL_CONTRACT=$POOL"
