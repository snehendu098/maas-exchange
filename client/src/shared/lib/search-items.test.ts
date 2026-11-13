import { describe, expect, test } from "bun:test";
import { buildSearchItems, filterSearchItems, wrapIndex } from "./search-items";

const ITEMS = buildSearchItems();
const ids = (q: string) => filterSearchItems(ITEMS, q).map((i) => i.id);

describe("search items", () => {
  test("perps, pages; trade page folded into markets", () => {
    expect(ITEMS[0].kind).toBe("perp");
    expect(ITEMS.some((i) => i.id === "page:/trade")).toBe(false);
  });
  test("empty query = all", () => {
    expect(filterSearchItems(ITEMS, "  ")).toHaveLength(ITEMS.length);
  });
  test("exact symbol beats substring, case-insensitive", () => {
    expect(ids("btc")[0]).toBe("perp:BTC");
    expect(ids("near")[0]).toBe("perp:NEAR");
    expect(ids("vau")).toEqual(["page:/vault"]);
    expect(ids("zzz")).toEqual([]);
  });
  test("wrap index", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});
