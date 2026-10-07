import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Native module: required at runtime from node_modules (not bundled), and traced into every server
  // function that imports it — the supplier statement PDF reader (src/lib/vyron-supplier-statement-pdf.ts).
  serverExternalPackages: ["@napi-rs/canvas"],
  staticPageGenerationTimeout: 180,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
