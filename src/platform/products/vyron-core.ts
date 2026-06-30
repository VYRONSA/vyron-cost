import type { VyronProductDefinition } from "@/platform/types";

export const VYRON_CORE_PRODUCT: VyronProductDefinition = {
  id: "vyron_core",
  name: "VYRON CORE",
  shortName: "CORE",
  tagline: "Enterprise forecasting, simulations and strategic command.",
  theme: {
    primary: "#0EA5E9",
    accent: "#6366F1",
    label: "CORE",
  },
  packages: ["enterprise"],
  landingPath: "/vyron-core/command-centre",
  status: "planned",
};
