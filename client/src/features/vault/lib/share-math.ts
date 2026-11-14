// shares 6dp (mxUSDC); empty vault mints 1:1, else pro-rata to NAV
export const SHARE_DECIMALS = 6;
export const PRICE_SCALE = 10n ** 6n;
const ONE_SHARE = 10n ** 6n;

const ceilDiv = (a: bigint, b: bigint) => (a === 0n ? 0n : (a - 1n) / b + 1n);

/** deposit side, floor */
export function toShares(assets: bigint, totalAssets: bigint, totalSupply: bigint) {
  return totalSupply === 0n || totalAssets === 0n ? assets : (assets * totalSupply) / totalAssets;
}

/** withdraw side, ceil: never burn too few */
export function toSharesUp(assets: bigint, totalAssets: bigint, totalSupply: bigint) {
  return totalSupply === 0n || totalAssets === 0n ? assets : ceilDiv(assets * totalSupply, totalAssets);
}

/** floor */
export function toAssets(shares: bigint, totalAssets: bigint, totalSupply: bigint) {
  return totalSupply === 0n ? shares : (shares * totalAssets) / totalSupply;
}

/** USDC 1e6 per 1 whole share */
export function sharePrice(totalAssets: bigint, totalSupply: bigint) {
  return toAssets(ONE_SHARE, totalAssets, totalSupply);
}
