import type { Metadata } from "next";
import { MARKETS } from "@/shared/config/markets";
import { routes } from "@/shared/config/navigation";
import { SITE } from "@/shared/config/site";

export interface SitemapPath {
  path: string;
  /** 0..1, sitemap hint */
  priority: number;
}

/** Every indexable route: perp markets + app pages. */
export function sitemapPaths(): SitemapPath[] {
  return [
    ...MARKETS.map((m) => ({ path: routes.trade(m.symbol), priority: 1 })),
    { path: routes.vault(), priority: 0.9 },
    { path: routes.portfolio(), priority: 0.5 },
  ];
}

export const absoluteUrl = (path: string) => `${SITE.url}${path}`;

const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: SITE.title };

/** Per-page title/description/canonical + full og/twitter (a page-level openGraph replaces the root one). */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const full = `${title} | ${SITE.name}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE.name, locale: "en_US", title: full, description, url: path, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
  };
}
