import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { env } from "@/lib/env";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

// Applies a stored theme choice before first paint. Without one, CSS follows the OS.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("fs-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
