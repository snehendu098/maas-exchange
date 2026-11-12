import { MARKETS } from "@/shared/config/markets";
import { MAIN_NAV, routes } from "@/shared/config/navigation";
import type { TokenLogoAsset } from "@/shared/ui/token-logo";

export type SearchKind = "perp" | "page";

export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  /** muted chip after the title, e.g. $BTC */
  tag: string;
  sub: string;
  href: string;
  asset?: TokenLogoAsset;
  keywords: readonly string[];
}

// trade page is covered by its market rows
const MARKET_PAGES = new Set(["/trade"]);

/** Every palette entry: perp markets, then pages. */
export function buildSearchItems(): SearchItem[] {
  const perps = MARKETS.map<SearchItem>((m) => ({
    id: `perp:${m.symbol}`,
    kind: "perp",
    title: m.name,
    tag: `$${m.symbol}`,
    sub: `Perp · ${m.symbol}-PERP · up to ${m.maxLeverage}x`,
    href: routes.trade(m.symbol),
    asset: m,
    keywords: [m.symbol, m.name, "perp", "trade"],
  }));
  const pages = MAIN_NAV.filter((n) => !MARKET_PAGES.has(n.match)).map<SearchItem>((n) => ({
    id: `page:${n.match}`,
    kind: "page",
    title: n.label,
    tag: "Page",
    sub: n.href,
    href: n.href,
    keywords: [n.label],
  }));
  return [...perps, ...pages];
}

function score(item: SearchItem, q: string) {
  const words = item.keywords.map((k) => k.toLowerCase());
  if (words.includes(q)) return 0;
  if (words.some((w) => w.startsWith(q))) return 1;
  if (words.some((w) => w.includes(q))) return 2;
  return null;
}

/** Exact > prefix > substring; ties keep list order. Empty query = all. */
export function filterSearchItems(items: readonly SearchItem[], query: string): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items
    .map((item, i) => ({ item, i, s: score(item, q) }))
    .filter((r): r is { item: SearchItem; i: number; s: number } => r.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((r) => r.item);
}

/** Arrow-key step through a list of len, wrapping at both ends. */
export const wrapIndex = (i: number, delta: number, len: number) => (len ? (i + delta + len) % len : 0);
