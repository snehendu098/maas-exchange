const numberFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(options: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options);
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

/** 1234.5 -> "1,234.50" */
export function formatNumber(value: number, decimals = 2) {
  return getFormatter({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Number of decimals needed to show `value` with `significant` significant digits. */
export function decimalsFor(value: number, significant = 3) {
  if (value === 0 || !Number.isFinite(value)) return 2;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return Math.max(2, significant - 1 - magnitude);
}

/** Number of decimals implied by a tick size: 0.0001 -> 4 */
export function decimalsForTick(tick: number) {
  return Math.max(0, Math.round(-Math.log10(tick)));
}

/** 96.48 -> "96.48", 0.03213 -> "0.0321" */
export function formatPrice(value: number) {
  return formatNumber(value, value >= 1 ? 2 : decimalsFor(value, 3));
}

/** Tabular price for lists and the chart: 0.03213 -> "0.032130". */
export function formatPricePrecise(value: number) {
  return formatNumber(value, value >= 1 ? 2 : Math.max(6, decimalsFor(value, 4)));
}

export function formatUsd(value: number, decimals = 2) {
  return `$${formatNumber(value, decimals)}`;
}

/** 31.02 -> "+31.02%", -1.89 -> "-1.89%" */
export function formatSignedPercent(value: number, decimals = 2) {
  const sign = value < 0 ? "-" : "+";
  const digits = getFormatter({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(Math.abs(value));
  return `${sign}${digits}%`;
}

/** 0 -> "+$0.00", -12 -> "-$12.00" */
export function formatSignedUsd(value: number, decimals = 2) {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatUsd(Math.abs(value), decimals)}`;
}

const COMPACT_UNITS = [
  { value: 1e12, suffix: "T", decimals: 2 },
  { value: 1e9, suffix: "B", decimals: 2 },
  { value: 1e6, suffix: "M", decimals: 2 },
  { value: 1e3, suffix: "K", decimals: 1 },
] as const;

/** 2_760_000_000 -> "$2.76B", 607_600 -> "$607.6K" */
export function formatCompactUsd(value: number) {
  const unit = COMPACT_UNITS.find((u) => Math.abs(value) >= u.value);
  if (!unit) return formatUsd(value);
  return `$${formatNumber(value / unit.value, unit.decimals)}${unit.suffix}`;
}

/** Order-book sizes: 323.86 -> "323.86", 72_900 -> "72.90K" */
export function formatSize(value: number) {
  if (Math.abs(value) >= 1e6) return `${formatNumber(value / 1e6, 2)}M`;
  if (Math.abs(value) >= 1e4) return `${formatNumber(value / 1e3, 2)}K`;
  return formatNumber(value, 2);
}

/** Trade sizes keep 4 significant digits without trailing zeros: 13.90 -> "13.9" */
export function formatSignificant(value: number, significant = 4) {
  const magnitude = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, significant - 1 - magnitude);
  return getFormatter({ maximumFractionDigits: decimals }).format(value);
}

/** TradingView-style axis label: 22_400 -> "22.4 K" */
export function formatVolume(value: number) {
  const unit = COMPACT_UNITS.find((u) => Math.abs(value) >= u.value);
  if (!unit) return getFormatter({ maximumFractionDigits: 0 }).format(value);
  const scaled = value / unit.value;
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${getFormatter({ maximumFractionDigits: decimals }).format(scaled)} ${unit.suffix}`;
}

/** 32 -> "32s", 186 -> "3m", 7200 -> "2h" */
export function formatAge(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** "0xf39Fd6...2266" */
export function truncateAddress(address: string, lead = 4, tail = 4) {
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

/** Date -> "11:16:42 UTC" */
export function formatUtcTime(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}
