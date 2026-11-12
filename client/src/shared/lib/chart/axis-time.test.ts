import { describe, expect, test } from "bun:test";
import { dayStarts, timeTicks } from "./axis-time";

const DAY = 86_400;
const D0 = Date.UTC(2026, 9, 30) / 1000;

describe("dayStarts", () => {
  test("one tick per UTC day, partial first day skipped", () => {
    const hourly = Array.from({ length: 50 }, (_, i) => D0 + 20 * 3600 + i * 3600);
    expect(dayStarts(hourly)).toEqual([D0 + DAY, D0 + 2 * DAY]);
  });
  test("keeps the first day when it starts at midnight", () => {
    const hourly = Array.from({ length: 30 }, (_, i) => D0 + i * 3600);
    expect(dayStarts(hourly)).toEqual([D0, D0 + DAY]);
  });
  test("empty in, empty out", () => expect(dayStarts([])).toEqual([]));
});

describe("timeTicks", () => {
  test("round steps inside range", () => {
    expect(timeTicks(1000, 1000 + 6 * 3600 - 1)).toEqual([3600, 7200, 10800, 14400, 18000, 21600]);
    expect(timeTicks(0, 3 * 86_400).every((t) => t % 43_200 === 0)).toBe(true);
  });
});
