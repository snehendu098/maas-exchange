#!/usr/bin/env bash
# testnet: mint fake tokens, seed pools 0..2 at MOCK_PRICES, fund MM + a demo user with USDC.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a
NET=${NEAR_NETWORK:-testnet}; ME=${NEAR_MASTER_ACCOUNT:?}; POOL=${POOL_CONTRACT:-pool.$ME}
USDC=${USDC_CONTRACT:-usdc.fakes.testnet}
KC=${NEAR_KEYCHAIN:+${NEAR_KEYCHAIN}-}keychain
BASES=(${BASE_TOKENS:-wbtc.fakes.testnet weth.fakes.testnet stnear.fakes.testnet})
DECS=(${BASE_DECIMALS:-8 18 24})
IFS=, read -ra PX <<<"${MOCK_PRICES:-100000,3500,3}"
USD_DEPTH=${POOL_DEPTH_USD:-200000}   # USDC per pool side
tx() { # signer contract method json [deposit]
  near contract call-function as-transaction "$2" "$3" json-args "$4" prepaid-gas '100 Tgas' \
    attached-deposit "${5:-0 NEAR}" sign-as "$1" network-config "$NET" sign-with-$KC send 2>&1 \
    | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'rror|panicked' && return 1 || true
}
reg() { tx "$ME" "$1" storage_deposit "{\"account_id\":\"$2\"}" '0.0125 NEAR'; }
mint() { tx "$ME" "$1" mint "{\"account_id\":\"$2\",\"amount\":\"$3\"}"; }

NOW=$(( $(date +%s) * 1000 - 5000 ))
tx "$ME" "$POOL" push_prices "{\"prices\":[[0,\"${PX[0]}000000\",$NOW],[1,\"${PX[1]}000000\",$NOW],[2,\"${PX[2]}000000\",$NOW]]}"
reg "$USDC" "$ME"
for i in 0 1 2; do
  t=${BASES[$i]}; usdc=$(( USD_DEPTH * 1000000 ))
  base=$(python3 -c "print($USD_DEPTH * 10**${DECS[$i]} // ${PX[$i]})")
  reg "$t" "$ME"
  mint "$USDC" "$ME" "$usdc"; mint "$t" "$ME" "$base"
  tx "$ME" "$USDC" ft_transfer_call "{\"receiver_id\":\"$POOL\",\"amount\":\"$usdc\",\"msg\":\"\"}" '1 yoctoNEAR'
  tx "$ME" "$t" ft_transfer_call "{\"receiver_id\":\"$POOL\",\"amount\":\"$base\",\"msg\":\"\"}" '1 yoctoNEAR'
  tx "$ME" "$POOL" add_liquidity "{\"pool_id\":$i,\"amounts\":[\"$usdc\",\"$base\"],\"min_shares\":\"0\"}"
  echo "pool $i: $USD_DEPTH USDC + $base $t"
done
for a in ${MM_ACCOUNT_ID:-} ${DEMO_USER:-}; do
  reg "$USDC" "$a"; mint "$USDC" "$a" "${FUND_USDC:-100000000000}"; echo "funded $a"
done
