import type { Metadata } from "next";
import { Inter_Tight, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./motion.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MaaS Exchange — delta-neutral vault + trading terminal on NEAR",
  description: "Deposit USDC, earn funding delta-neutral. Perps on our own orderbook, settled on NEAR. Vault pays 0 fees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${geistMono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
