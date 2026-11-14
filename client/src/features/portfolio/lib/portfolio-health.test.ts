import { describe, expect, test } from "bun:test";
import { allocation } from "./allocation";
import { marginHealth } from "./margin-health";

describe("allocation", () => {
  test("shares sum to 1, negatives clamp to 0", () => {
    const { total, slices } = allocation({ wallet: 50, perp: 150, vault: -10 });
    expect(total).toBe(200);
    expect(slices.map((s) => s.share)).toEqual([0.75, 0, 0.25]);
  });
  test("empty wallet -> zero shares", () => {
    expect(allocation({ wallet: 0, perp: 0, vault: 0 }).slices.every((s) => s.share === 0)).toBe(true);
  });
});

describe("marginHealth", () => {
  test("no margin is idle", () => expect(marginHealth(100, 0, 0).level).toBe("idle"));
  test("levels by maint. ratio", () => {
    expect(marginHealth(100, 20, 10).level).toBe("safe");
    expect(marginHealth(100, 70, 60).level).toBe("watch");
    expect(marginHealth(100, 95, 85).level).toBe("risk");
  });
  test("non-positive equity with margin is risk", () => expect(marginHealth(0, 5, 2)).toEqual({ ratio: 1, usage: 1, level: "risk" }));
});
