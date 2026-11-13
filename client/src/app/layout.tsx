import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { AppFooter } from "@/shared/layout/footer/app-footer";
import { AppHeader } from "@/shared/layout/header/app-header";
import { ConnectButton } from "@/features/wallet/components/connect-button";
import { SITE } from "@/shared/config/site";
import { Providers } from "./providers";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";

// static family, weights the ui uses
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// figures, addresses, order book
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// og/twitter images come from app/opengraph-image.png + twitter-image.png
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  openGraph: { type: "website", siteName: SITE.name, title: SITE.title, description: SITE.description, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
  robots: { index: true, follow: true },
  category: "finance",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const viewport: Viewport = {
  themeColor: "#101010",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col overflow-x-clip bg-bg font-sans text-fg md:h-dvh md:overflow-hidden">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <Providers>
          <AppHeader actions={<ConnectButton />} />
          <main className="flex flex-1 flex-col md:min-h-0">{children}</main>
          <AppFooter />
        </Providers>
      </body>
    </html>
  );
}
