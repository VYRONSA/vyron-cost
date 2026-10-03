import type { MetadataRoute } from "next";
import { VOLORA_SITE_URL } from "@/lib/volora-site";

// Only the public marketing page. Everything else on this host is the signed-in
// application (workspace modules, portals, API) and is not for indexing.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${VOLORA_SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
