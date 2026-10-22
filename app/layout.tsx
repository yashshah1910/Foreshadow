import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { env } from "@/lib/env";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl.startsWith("http") ? env.siteUrl : `https://${env.siteUrl}`),
  title: {
    default: "Foreshadow — Someone knew. Prove it.",
    template: "%s · Foreshadow",
  },
  description:
    "Before big company news, some traders place unusually large options bets. Foreshadow finds those bets in Unusual Whales data, scores how unusual they were, and checks whether they turned out right.",
  openGraph: { siteName: "Foreshadow", type: "website" },
  alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: "Foreshadow: unusual betting" }] } },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrument.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="pop sr-only z-50 px-4 py-2.5 text-[15px] font-medium text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 w-full outline-none">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
