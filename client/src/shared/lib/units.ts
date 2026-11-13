/** "1.5", 6 -> 1500000n; truncates extra decimals. Throws on bad input. */
export function parseUnits(value: string, decimals: number): bigint {
  if (!/^-?\d*\.?\d*$/.test(value) || value === "" || value === "." || value === "-") throw new Error(`invalid number "${value}"`);
  const negative = value.startsWith("-");
  const [int = "", frac = ""] = value.replace("-", "").split(".");
  const v = BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals).padEnd(decimals, "0") || "0");
  return negative ? -v : v;
}

/** 1500000n, 6 -> "1.5". */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const frac = (v % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${v / scale}${frac ? `.${frac}` : ""}`;
}

export const PRICE_DECIMALS = 6;
export const SIZE_DECIMALS = 8;
export const USDC_DECIMALS = 6;
export const SIZE_UNIT = 10n ** BigInt(SIZE_DECIMALS);

export type RawInput = bigint | string;

const toBig = (v: RawInput) => (typeof v === "bigint" ? v : BigInt(v));
const abs = (v: bigint) => (v < 0n ? -v : v);

/** "65432.1" -> 65432100000n. Throws on bad input. */
export const parsePrice = (value: string) => parseUnits(value.trim(), PRICE_DECIMALS);
export const parseSize = (value: string) => parseUnits(value.trim(), SIZE_DECIMALS);
export const parseUsdc = (value: string) => parseUnits(value.trim(), USDC_DECIMALS);

/** Lenient parse for form input; null if empty or invalid. */
export function tryParse(value: string, decimals: number): bigint | null {
  const v = value.trim();
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return null;
  const [, frac = ""] = v.split(".");
  if (frac.length > decimals) return null;
  return parseUnits(v, decimals);
}

export const priceToNumber = (raw: RawInput) => Number(formatUnits(toBig(raw), PRICE_DECIMALS));
export const sizeToNumber = (raw: RawInput) => Number(formatUnits(toBig(raw), SIZE_DECIMALS));
export const usdcToNumber = (raw: RawInput) => Number(formatUnits(toBig(raw), USDC_DECIMALS));

function groupThousands(int: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Exact bigint formatting, half-up rounding: (65432123456n, 6, 2) -> "65,432.12". */
export function formatRaw(raw: RawInput, decimals: number, displayDecimals: number): string {
  const value = toBig(raw);
  const negative = value < 0n;
  let v = abs(value);
  const dp = Math.min(displayDecimals, decimals);
  const drop = 10n ** BigInt(decimals - dp);
  v = (v + drop / 2n) / drop;
  const scale = 10n ** BigInt(dp);
  const int = groupThousands((v / scale).toString());
  const frac = dp > 0 ? `.${(v % scale).toString().padStart(dp, "0")}` : "";
  return `${negative && v !== 0n ? "-" : ""}${int}${frac}`;
}

export const formatPriceRaw = (raw: RawInput, dp = 2) => formatRaw(raw, PRICE_DECIMALS, dp);
export const formatSizeRaw = (raw: RawInput, dp = 4) => formatRaw(raw, SIZE_DECIMALS, dp);
export const formatUsdcRaw = (raw: RawInput, dp = 2) => formatRaw(raw, USDC_DECIMALS, dp);

/** Decimals implied by a step: tick 100_000 @1e6 -> 1, lot 10_000 @1e8 -> 4. */
export function decimalsForStep(step: bigint, decimals: number) {
  let d = decimals;
  let s = step;
  while (d > 0 && s % 10n === 0n) {
    s /= 10n;
    d--;
  }
  return d;
}

/** floor(|size| * price / 1e8), USDC 1e6. Matches contract notional. */
export function notional(size: RawInput, price: RawInput): bigint {
  return (abs(toBig(size)) * toBig(price)) / SIZE_UNIT;
}

/** ceil(amount * bps / 1e4). Matches contract mul_bps_up. */
export function mulBpsUp(amount: bigint, bps: number): bigint {
  const x = amount * BigInt(bps);
  return x === 0n ? 0n : (x - 1n) / 10_000n + 1n;
}

export function roundToStep(value: bigint, step: bigint, mode: "down" | "up" | "nearest" = "nearest") {
  const q = value / step;
  const r = value % step;
  if (r === 0n) return value;
  if (mode === "down") return q * step;
  if (mode === "up") return (q + 1n) * step;
  return (r * 2n >= step ? q + 1n : q) * step;
}
