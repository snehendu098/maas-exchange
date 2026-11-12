import { DEFAULT_MARKET } from "./markets";

export const routes = {
  trade: (symbol: string = DEFAULT_MARKET) => `/trade/${encodeURIComponent(symbol)}`,
  vault: (view?: "position") => (view ? `/vault?view=${view}` : "/vault"),
  portfolio: () => "/portfolio",
  leaderboard: () => "/leaderboard",
} as const;

export interface NavItem {
  label: string;
  href: string;
  match: string;
}

export const MAIN_NAV: NavItem[] = [
  { label: "Trade", href: routes.trade(), match: "/trade" },
  { label: "Vault", href: routes.vault(), match: "/vault" },
  { label: "Portfolio", href: routes.portfolio(), match: "/portfolio" },
  { label: "Leaderboard", href: routes.leaderboard(), match: "/leaderboard" },
];

export interface MoreLink {
  label: string;
  /** null = not published yet, shows "coming soon" */
  href: string | null;
  external?: boolean;
}

export const REPO_URL = "https://github.com/snehendu098/maas-exchange";

export const MORE_NAV: MoreLink[] = [{ label: "GitHub", href: REPO_URL, external: true }];
