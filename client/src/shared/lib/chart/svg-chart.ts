/** svg chart geometry; paths live in a CHART_WIDTH x CHART_HEIGHT viewBox */

export const CHART_WIDTH = 1000;
export const CHART_HEIGHT = 320;
/** one sample; time unix s */
export interface SeriesPoint {
  time: number;
  value: number;
}

/** zoom floor, in samples */
export const MIN_VIEW_SPAN = 4;

/** on-screen slice, fractional sample indices so wheel anchor never drifts */
export interface View {
  start: number;
  end: number;
}

export interface Bounds {
  min: number;
  max: number;
  /** tick spacing; min and max are multiples */
  step: number;
  view: View;
}

export interface BoundsOptions {
  tickCount?: number;
  padding?: number;
  /** pin zero in range (funding-style sign charts) */
  includeZero?: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export const fullView = (count: number): View => ({ start: 0, end: Math.max(0, count - 1) });

export function isZoomed(view: View, count: number) {
  const full = fullView(count);
  return view.start > full.start + 0.01 || view.end < full.end - 0.01;
}

/** keep window inside series and above min span; edges stop hard */
export function clampView(view: View, count: number): View {
  const last = Math.max(0, count - 1);
  let span = Math.min(last, Math.max(Math.min(last, MIN_VIEW_SPAN), view.end - view.start));
  if (!Number.isFinite(span) || span <= 0) span = last;
  const start = clamp(view.start, 0, last - span);
  return { start, end: start + span };
}

/** zoom about anchor index; factor < 1 narrows */
export function zoomView(view: View, anchor: number, factor: number, count: number): View {
  const span = view.end - view.start;
  const next = span * factor;
  const offset = span === 0 ? 0.5 : (anchor - view.start) / span;
  return clampView({ start: anchor - next * offset, end: anchor + next * (1 - offset) }, count);
}

export const panView = (view: View, delta: number, count: number): View =>
  clampView({ start: view.start + delta, end: view.end + delta }, count);

/** fraction 0..1 across plot -> fractional index */
export const indexAt = (fraction: number, view: View) => view.start + fraction * (view.end - view.start);

/** nearest sample, clamped so a pointer off-plot still reads one */
export function nearestIndex(fraction: number, view: View, count: number) {
  if (count <= 1) return 0;
  return clamp(Math.round(indexAt(fraction, view)), 0, count - 1);
}

/** samples in frame plus one each side so the line enters from off-screen */
export function visibleRange(view: View, count: number) {
  const first = Math.max(0, Math.floor(view.start) - 1);
  const last = Math.min(Math.max(0, count - 1), Math.ceil(view.end) + 1);
  return { first, last };
}

/** 1 / 2 / 2.5 / 5 x 10^n */
export function niceStep(raw: number) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
}

/** y range of samples in view, snapped out to round ticks */
export function boundsFor(points: readonly number[], view: View, options: BoundsOptions = {}): Bounds {
  const { tickCount = 5, padding = 0.08, includeZero = false } = options;
  const { first, last } = visibleRange(view, points.length);
  const slice = points.slice(first, last + 1);
  const values = slice.length > 0 ? slice : [0];
  const anchor = includeZero ? [0] : [];
  const low = Math.min(...anchor, ...values);
  const high = Math.max(...anchor, ...values);
  const room = (high - low) * padding || Math.abs(high) * padding || padding;
  // with zero pinned, pad away from it only so the axis stays on the floor
  const bottom = includeZero && low >= 0 ? low : low - room;
  const top = includeZero && high <= 0 ? high : high + room;
  const step = niceStep((top - bottom) / Math.max(1, tickCount - 1));
  return { min: Math.floor(bottom / step) * step, max: Math.ceil(top / step) * step, step, view };
}

export function xAt(index: number, bounds: Bounds) {
  const span = bounds.view.end - bounds.view.start;
  return span <= 0 ? CHART_WIDTH / 2 : ((index - bounds.view.start) / span) * CHART_WIDTH;
}

export function yAt(value: number, bounds: Bounds) {
  const range = bounds.max - bounds.min;
  return range <= 0 ? CHART_HEIGHT / 2 : CHART_HEIGHT - ((value - bounds.min) / range) * CHART_HEIGHT;
}

/** % position for html overlays on the svg */
export const percentX = (index: number, bounds: Bounds) => (xAt(index, bounds) / CHART_WIDTH) * 100;
export const percentY = (value: number, bounds: Bounds) => (yAt(value, bounds) / CHART_HEIGHT) * 100;

/** y of zero, clamped into plot; area baseline + colour split line */
export const zeroBaseline = (bounds: Bounds) => clamp(yAt(0, bounds), 0, CHART_HEIGHT);

/** ticks high -> low */
export function yTicks(bounds: Bounds) {
  const steps = Math.round((bounds.max - bounds.min) / bounds.step);
  return Array.from({ length: steps + 1 }, (_, i) => bounds.max - bounds.step * i);
}

/** decimals so a tick step reads exactly (2.5 -> 1) */
export function stepDigits(step: number, max = 4) {
  for (let digits = 0; digits < max; digits++) {
    const scaled = Math.abs(step) * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return digits;
  }
  return max;
}

/** fritsch-carlson slopes: monotone cubic, no overshoot past samples */
function tangents(ys: readonly number[]) {
  const slopes = ys.slice(1).map((y, i) => y - ys[i]);
  return ys.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0;
    if (i === ys.length - 1) return slopes[slopes.length - 1] ?? 0;
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) return 0;
    const average = (before + after) / 2;
    return Math.sign(average) * Math.min(Math.abs(average), 3 * Math.min(Math.abs(before), Math.abs(after)));
  });
}

const pt = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** curve through samples; offset = index of points[0] */
export function linePath(points: readonly number[], bounds: Bounds, offset = 0) {
  if (points.length === 0) return "";
  const xs = points.map((_, i) => xAt(offset + i, bounds));
  const ys = points.map((v) => yAt(v, bounds));
  const slopes = tangents(ys);
  let path = `M${pt(xs[0], ys[0])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    path += ` C${pt(xs[i] + dx, ys[i] + slopes[i] / 3)}, ${pt(xs[i + 1] - dx, ys[i + 1] - slopes[i + 1] / 3)}, ${pt(xs[i + 1], ys[i + 1])}`;
  }
  return path;
}

/** same curve closed down/up to baseline y */
export function areaPath(points: readonly number[], bounds: Bounds, offset = 0, baseline = CHART_HEIGHT) {
  if (points.length === 0) return "";
  const start = xAt(offset, bounds);
  const end = xAt(offset + points.length - 1, bounds);
  return `${linePath(points, bounds, offset)} L${pt(end, baseline)} L${pt(start, baseline)} Z`;
}
