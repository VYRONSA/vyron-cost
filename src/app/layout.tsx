import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRuntime from "@/components/pwa/PwaRuntime";

export const metadata: Metadata = {
  title: "VYRON COST",
  description: "Profit protection and cost intelligence powered by VYRON COST.",
  applicationName: "VYRON COST",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "VYRON COST",
    statusBarStyle: "default",
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
  themeColor: "#07111F",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
