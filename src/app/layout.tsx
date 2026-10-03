import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import PwaRuntime from "@/components/pwa/PwaRuntime";
import { VOLORA_DESCRIPTION, VOLORA_SITE_URL, VOLORA_TITLE, VYRONSOFT } from "@/lib/volora-site";

// VOLORA type system: Montserrat for display (headings, KPI figures), Inter for
// everything else. Self-hosted by next/font — no browser request to Google.
const voloraBody = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-volora-body",
});
const voloraDisplay = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-volora-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(VOLORA_SITE_URL),
  title: {
    default: VOLORA_TITLE,
    template: "%s · VOLORA",
  },
  description: VOLORA_DESCRIPTION,
  applicationName: "VOLORA",
  creator: VYRONSOFT.name,
  publisher: VYRONSOFT.name,
  openGraph: {
    type: "website",
    siteName: "VOLORA",
    title: VOLORA_TITLE,
    description: VOLORA_DESCRIPTION,
    images: [{ url: "/og-volora.png", width: 1200, height: 630, alt: "VOLORA — Turn every cost into a more profitable tomorrow." }],
  },
  twitter: {
    card: "summary_large_image",
    title: VOLORA_TITLE,
    description: VOLORA_DESCRIPTION,
    images: ["/og-volora.png"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "VOLORA",
    statusBarStyle: "black-translucent",
    startupImage: [
      "/splash/splash-640x1136.png",
      "/splash/splash-750x1334.png",
      "/splash/splash-828x1792.png",
      "/splash/splash-1170x2532.png",
      "/splash/splash-1242x2688.png",
      "/splash/splash-1536x2048.png",
      "/splash/splash-1668x2224.png",
      "/splash/splash-1668x2388.png",
      "/splash/splash-2048x2732.png",
    ],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B202B",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${voloraBody.variable} ${voloraDisplay.variable}`}>
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
