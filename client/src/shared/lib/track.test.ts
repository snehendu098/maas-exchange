import { describe, expect, test } from "bun:test";
import { percentFor, valueAt } from "./track";

const MARKS = [1, 2, 5, 10, 20];

describe("track", () => {
  test("marks sit at even steps", () => {
    expect(percentFor(1, MARKS)).toBe(0);
    expect(percentFor(2, MARKS)).toBe(25);
    expect(percentFor(10, MARKS)).toBe(75);
    expect(percentFor(20, MARKS)).toBe(100);
  });

  test("interpolates inside a gap", () => {
    expect(percentFor(15, MARKS)).toBe(87.5);
  });

  test("valueAt inverts percentFor", () => {
    for (const v of [1, 2, 3, 5, 7, 10, 15, 20]) expect(valueAt(percentFor(v, MARKS), MARKS)).toBe(v);
  });

  test("clamps out of range", () => {
    expect(valueAt(-10, MARKS)).toBe(1);
    expect(valueAt(140, MARKS)).toBe(20);
    expect(percentFor(99, MARKS)).toBe(100);
  });
});
