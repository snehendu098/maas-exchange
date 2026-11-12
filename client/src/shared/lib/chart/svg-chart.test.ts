import { describe, expect, test } from "bun:test";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  MIN_VIEW_SPAN,
  areaPath,
  boundsFor,
  clampView,
  fullView,
  isZoomed,
  linePath,
  nearestIndex,
  niceStep,
  panView,
  stepDigits,
  visibleRange,
  yAt,
  yTicks,
  zeroBaseline,
  zoomView,
} from "./svg-chart";

const FULL = fullView(101);

describe("bounds", () => {
  test("includeZero pins zero for all-positive series, floor stays at 0", () => {
    const b = boundsFor([3, 4, 5], fullView(3), { includeZero: true });
    expect(b.min).toBe(0);
    expect(b.max).toBeGreaterThanOrEqual(5);
  });
  test("includeZero spans both signs", () => {
    const b = boundsFor([-2, 1], fullView(2), { includeZero: true });
    expect(b.min).toBeLessThan(-2);
    expect(b.max).toBeGreaterThan(1);
  });
  test("without zero, range hugs samples with padding", () => {
    const b = boundsFor([250_000, 250_400], fullView(2));
    expect(b.min).toBeGreaterThan(249_000);
    expect(b.min).toBeLessThan(250_000);
    expect(b.max).toBeGreaterThan(250_400);
  });
  test("flat series still has spread", () => {
    const b = boundsFor([100, 100], fullView(2));
    expect(b.max).toBeGreaterThan(b.min);
  });
  test("scales to view, not whole series", () => {
    const points = [...Array.from({ length: 10 }, () => 1), 1000];
    const b = boundsFor(points, { start: 0, end: 5 });
    expect(b.max).toBeLessThan(10);
  });
  test("min/max are step multiples", () => {
    const b = boundsFor([0.013, 0.021, -0.004], fullView(3), { includeZero: true });
    expect(Math.abs(b.min / b.step - Math.round(b.min / b.step))).toBeLessThan(1e-9);
    expect(Math.abs(b.max / b.step - Math.round(b.max / b.step))).toBeLessThan(1e-9);
  });
});

describe("ticks", () => {
  test("nice steps", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.6)).toBe(2);
    expect(niceStep(2.3)).toBe(2.5);
    expect(niceStep(37)).toBe(50);
    expect(niceStep(0)).toBe(1);
  });
  test("high to low, evenly stepped", () => {
    expect(yTicks({ min: 0, max: 10, step: 2.5, view: FULL })).toEqual([10, 7.5, 5, 2.5, 0]);
  });
  test("step digits", () => {
    expect(stepDigits(1000)).toBe(0);
    expect(stepDigits(2.5)).toBe(1);
    expect(stepDigits(0.0025)).toBe(4);
  });
  test("zero baseline", () => {
    const b = { min: -1, max: 1, step: 0.5, view: FULL };
    expect(zeroBaseline(b)).toBe(CHART_HEIGHT / 2);
    expect(zeroBaseline({ ...b, min: 1, max: 3 })).toBe(CHART_HEIGHT);
    expect(yAt(1, b)).toBe(0);
  });
});

describe("view", () => {
  test("zoom in about anchor keeps anchor fixed", () => {
    const v = zoomView(FULL, 50, 0.5, 101);
    expect(v).toEqual({ start: 25, end: 75 });
  });
  test("zoom clamps to min span and full series", () => {
    const tight = zoomView(FULL, 50, 0.001, 101);
    expect(tight.end - tight.start).toBe(MIN_VIEW_SPAN);
    expect(zoomView(FULL, 50, 4, 101)).toEqual(FULL);
    expect(isZoomed(tight, 101)).toBe(true);
    expect(isZoomed(FULL, 101)).toBe(false);
  });
  test("pan stops at edges, keeps span", () => {
    const v = { start: 10, end: 30 };
    expect(panView(v, -50, 101)).toEqual({ start: 0, end: 20 });
    expect(panView(v, 500, 101)).toEqual({ start: 80, end: 100 });
    expect(panView(v, 5, 101)).toEqual({ start: 15, end: 35 });
  });
  test("clamp handles tiny series", () => {
    expect(clampView({ start: 0, end: 10 }, 1)).toEqual({ start: 0, end: 0 });
    expect(clampView({ start: 0, end: 1 }, 3)).toEqual({ start: 0, end: 2 });
  });
  test("visible range pads one each side", () => {
    expect(visibleRange({ start: 10.4, end: 20.2 }, 101)).toEqual({ first: 9, last: 22 });
    expect(visibleRange(FULL, 101)).toEqual({ first: 0, last: 100 });
  });
  test("nearest index rounds and clamps", () => {
    expect(nearestIndex(0.5, FULL, 101)).toBe(50);
    expect(nearestIndex(0.504, FULL, 101)).toBe(50);
    expect(nearestIndex(2, FULL, 101)).toBe(100);
    expect(nearestIndex(-1, FULL, 101)).toBe(0);
    expect(nearestIndex(0.7, fullView(1), 1)).toBe(0);
  });
});

describe("paths", () => {
  const b = { min: 0, max: 10, step: 5, view: { start: 0, end: 2 } };
  test("empty and single point", () => {
    expect(linePath([], b)).toBe("");
    expect(areaPath([], b)).toBe("");
    expect(linePath([5], b)).toBe("M0.00 160.00");
  });
  test("two points: one cubic, endpoints exact", () => {
    const d = linePath([0, 10], b);
    expect(d.startsWith("M0.00 320.00 C")).toBe(true);
    expect(d.endsWith(`${(CHART_WIDTH / 2).toFixed(2)} 0.00`)).toBe(true);
    expect(d.match(/C/g)).toHaveLength(1);
  });
  test("n points: n-1 segments, offset shifts x", () => {
    const d = linePath([1, 5, 3], b, 0);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(linePath([5], b, 2)).toBe(`M${CHART_WIDTH.toFixed(2)} 160.00`);
  });
  test("monotone: flat at turning point", () => {
    const d = linePath([0, 10, 0], b);
    // second segment's first control y equals the peak y
    expect(d.split(" C")[2].startsWith("666.67 0.00")).toBe(true);
  });
  test("area closes to baseline", () => {
    expect(areaPath([0, 10], b, 0, 160).endsWith("L500.00 160.00 L0.00 160.00 Z")).toBe(true);
  });
});
