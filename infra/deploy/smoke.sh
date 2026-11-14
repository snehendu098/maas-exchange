#!/usr/bin/env bash
# testnet smoke: mint fake USDC + wBTC, push oracle, seed pool 0, swap as a trader, read the fee stream.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a
NET=${NEAR_NETWORK:-testnet}; ME=${NEAR_MASTER_ACCOUNT:?}; POOL=${POOL_CONTRACT:-pool.$ME}
USDC=${USDC_CONTRACT:-usdc.fakes.testnet}; BTC=${BTC_TOKEN:-wbtc.fakes.testnet}
KC=${NEAR_KEYCHAIN:+${NEAR_KEYCHAIN}-}keychain
tx() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" \
  attached-deposit "${4:-0 NEAR}" sign-as "$ME" network-config "$NET" sign-with-$KC send 2>&1 | grep -E 'Error|panicked|^[0-9"\[]' || true; }
RPC=${NEAR_RPC_URL:-https://rpc.$NET.near.org}
view() { sleep 2; curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf %s "$3" | base64)\"}}" | jq '.result.result | implode | fromjson'; }

for t in "$USDC" "$BTC"; do
  tx "$t" storage_deposit "{\"account_id\":\"$ME\"}" '0.0125 NEAR'
done
tx "$USDC" mint "{\"account_id\":\"$ME\",\"amount\":\"200000000000\"}"   # 200k USDC
tx "$BTC" mint "{\"account_id\":\"$ME\",\"amount\":\"200000000\"}"        # 2 BTC
NOW=$(( $(date +%s) * 1000 - 5000 ))
tx "$POOL" push_prices "{\"prices\":[[0,\"100000000000\",$NOW]]}"          # 100k USDC/BTC
tx "$USDC" ft_transfer_call "{\"receiver_id\":\"$POOL\",\"amount\":\"110000000000\",\"msg\":\"\"}" '1 yoctoNEAR'
tx "$BTC" ft_transfer_call "{\"receiver_id\":\"$POOL\",\"amount\":\"100000000\",\"msg\":\"\"}" '1 yoctoNEAR'
echo "== add liquidity 100k USDC + 1 BTC"
tx "$POOL" add_liquidity '{"pool_id":0,"amounts":["100000000000","100000000"],"min_shares":"0"}'
echo "== swap 10k USDC -> BTC (non-vault, dynamic fee)"
tx "$POOL" swap "{\"actions\":[{\"pool_id\":0,\"token_in\":\"$USDC\",\"amount_in\":\"10000000000\",\"token_out\":\"$BTC\",\"min_amount_out\":\"1\"}]}" '1 yoctoNEAR'
echo "== pool 0"; view "$POOL" pool_view '{"pool_id":0}'
echo "== LP earned (streams over 1h)"; view "$POOL" lp "{\"pool_id\":0,\"account_id\":\"$ME\"}"
