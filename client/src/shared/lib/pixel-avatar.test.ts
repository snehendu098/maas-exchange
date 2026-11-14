import { describe, expect, test } from "bun:test";
import { PIXEL_GRID, pixelAvatar } from "./pixel-avatar";

const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("pixel avatar", () => {
  test("deterministic, case-insensitive", () => {
    expect(pixelAvatar(A)).toEqual(pixelAvatar(A.toLowerCase()));
  });
  test("mirrored rows", () => {
    const { cells } = pixelAvatar(A);
    expect(cells).toHaveLength(PIXEL_GRID * PIXEL_GRID);
    for (let r = 0; r < PIXEL_GRID; r++) {
      const row = cells.slice(r * PIXEL_GRID, (r + 1) * PIXEL_GRID);
      expect(row).toEqual([...row].reverse());
    }
  });
  test("different addresses differ", () => {
    expect(pixelAvatar(A)).not.toEqual(pixelAvatar("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));
  });
});
