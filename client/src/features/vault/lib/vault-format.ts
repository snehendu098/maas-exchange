import { formatRaw, type RawInput } from "@/shared/lib/units";
import { SHARE_DECIMALS } from "./share-math";

/** 1234567n -> "1.2346" */
export const formatShares = (raw: RawInput, dp = 4) => formatRaw(raw, SHARE_DECIMALS, dp);

/** 1042311n -> "$1.042311" */
export const formatSharePrice = (raw: RawInput) => `$${formatRaw(raw, 6, 6)}`;

/** 10 -> "0.10%", 4000 -> "40.00%" */
export const formatBpsPercent = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** 0 -> "0m", 4500 -> "1h 15m", 200000 -> "2d 7h"; null -> "—" */
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** unix s -> "Nov 06 14:00 UTC" */
export function formatUtcStamp(ts: number) {
  const d = new Date(ts * 1000);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${month} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
