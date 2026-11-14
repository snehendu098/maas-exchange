import { describe, expect, test } from "bun:test";
import { createLiveFeed, parsePrices, type LivePrices } from "./live-prices";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("parsePrices", () => {
  test("keeps positive finite numbers only", () => {
    expect(parsePrices({ BTC: { price: 100 }, ETH: { price: -1 }, NEAR: { price: "3" } })).toEqual({ BTC: 100 });
  });
  test("junk body -> {}", () => {
    expect(parsePrices(null)).toEqual({});
    expect(parsePrices("x")).toEqual({});
  });
});

describe("createLiveFeed", () => {
  test("polls while subscribed, merges, keeps last on empty poll", async () => {
    const replies: LivePrices[] = [{ BTC: 1 }, {}, { ETH: 2 }];
    let calls = 0;
    const feed = createLiveFeed(async () => replies[calls++] ?? {}, 5);
    const seen: LivePrices[] = [];
    const off = feed.subscribe((p) => seen.push(p));
    await tick();
    expect(feed.latest()).toEqual({ BTC: 1 });
    expect(feed.isLive()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    off();
    expect(feed.latest()).toEqual({ BTC: 1, ETH: 2 });
    expect(seen.length).toBe(2);
    const after = calls;
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(after);
  });
});
