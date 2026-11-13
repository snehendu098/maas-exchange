import { describe, expect, test } from "bun:test";
import { leverageMarks } from "./leverage";

describe("leverageMarks", () => {
  test("stops below the cap, then the cap", () => {
    expect(leverageMarks(20)).toEqual([1, 2, 5, 10, 20]);
    expect(leverageMarks(3)).toEqual([1, 2, 3]);
    expect(leverageMarks(50)).toEqual([1, 2, 5, 10, 20, 50]);
  });
});
