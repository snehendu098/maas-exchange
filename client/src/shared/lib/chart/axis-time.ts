/** unix s -> "Nov 6" */
export const dayTick = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const DAY_SEC = 86_400;

/** date under the plot; hours once the frame is under 2 days */
export function axisCaption(ts: number, spanSec: number) {
  if (spanSec >= 2 * DAY_SEC) return dayTick(ts);
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

/** unix s -> "Nov 6, 14:05" UTC */
export const stampTick = (ts: number) => `${dayTick(ts)}, ${axisCaption(ts, 0)}`;

// round tick steps in seconds, 15m .. 30d
const STEPS = [900, 1800, 3600, 7200, 10800, 21600, 43200, DAY_SEC, 2 * DAY_SEC, 7 * DAY_SEC, 14 * DAY_SEC, 30 * DAY_SEC];

/** ~`count` ticks on round UTC boundaries inside [min, max] (unix s). */
export function timeTicks(min: number, max: number, count = 6) {
  const step = STEPS.find((s) => (max - min) / s <= count) ?? STEPS.at(-1)!;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
  return ticks;
}

/** first sample of each full UTC day; a partial leading day is skipped so ticks space evenly */
export function dayStarts(times: readonly number[]) {
  const ticks: number[] = [];
  let day = Number.NaN;
  for (const t of times) {
    const d = Math.floor(t / DAY_SEC);
    if (d !== day) ticks.push(t);
    day = d;
  }
  if (ticks.length > 1 && ticks[0] % DAY_SEC !== 0) ticks.shift();
  return ticks;
}
