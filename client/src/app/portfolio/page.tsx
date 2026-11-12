import type { Metadata } from "next";
import { pageMetadata } from "@/shared/lib/seo";
import { PortfolioScreen } from "@/features/portfolio/components/portfolio-screen";

export const metadata: Metadata = pageMetadata({
  title: "Portfolio",
  description: "Your maas positions, vault stake, PnL history and margin health in one place.",
  path: "/portfolio",
});

export default function PortfolioPage() {
  return <PortfolioScreen />;
}
