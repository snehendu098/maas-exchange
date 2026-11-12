import type { Metadata } from "next";
import { pageMetadata } from "@/shared/lib/seo";
import { VaultScreen } from "@/features/vault/components/vault-screen";

export const metadata: Metadata = pageMetadata({
  title: "USDC Vault",
  description: "Deposit USDC into a delta-neutral vault on NEAR: spot long plus perp short per market, earning funding.",
  path: "/vault",
});

// ?view=position opens the Position tab (portfolio Manage link)
export default async function VaultPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <VaultScreen initialTab={view === "position" ? "position" : undefined} />;
}
