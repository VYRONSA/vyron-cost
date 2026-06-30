import type { VyronProductDefinition } from "@/platform/types";

export const VYRON_REACH_PRODUCT: VyronProductDefinition = {
  id: "vyron_reach",
  name: "VYRON REACH",
  shortName: "REACH",
  tagline: "Customer engagement, campaigns and multi-channel reach.",
  theme: {
    primary: "#DB2777",
    accent: "#EC4899",
    label: "REACH",
  },
  packages: ["enterprise"],
  landingPath: "/",
  status: "planned",
};
