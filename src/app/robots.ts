import type { MetadataRoute } from "next";
import { VOLORA_SITE_URL } from "@/lib/volora-site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/developer"],
    },
    sitemap: `${VOLORA_SITE_URL}/sitemap.xml`,
  };
}
