import { describe, expect, test } from "bun:test";
import { MARKETS } from "@/shared/config/markets";
import { absoluteUrl, pageMetadata, sitemapPaths } from "./seo";

describe("seo", () => {
  test("sitemap covers markets, pages; no dupes", () => {
    const paths = sitemapPaths().map((p) => p.path);
    expect(paths).toContain(`/trade/${MARKETS[0].symbol}`);
    expect(paths).toEqual(expect.arrayContaining(["/vault", "/portfolio"]));
    expect(new Set(paths).size).toBe(paths.length);
  });
  test("absolute url has no double slash", () => {
    expect(absoluteUrl("/vault")).toMatch(/^https?:\/\/[^/]+\/vault$/);
  });
  test("page metadata keeps site og fields + branded title", () => {
    const m = pageMetadata({ title: "Vault", description: "d", path: "/vault" });
    expect(m.alternates?.canonical).toBe("/vault");
    expect(m.openGraph).toMatchObject({ siteName: "MaaS Exchange", title: "Vault | MaaS Exchange", url: "/vault" });
  });
});
