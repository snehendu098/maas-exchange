import type { MetadataRoute } from "next";
import { absoluteUrl, sitemapPaths } from "@/shared/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map(({ path, priority }) => ({ url: absoluteUrl(path), changeFrequency: "daily", priority }));
}
