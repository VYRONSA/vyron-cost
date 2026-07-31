import type { VyronProductDefinition } from "@/platform/types";

export const VYRON_FARM_PRODUCT: VyronProductDefinition = {
  id: "vyron_farm",
  name: "VYRON FARM",
  shortName: "FARM",
  tagline: "Agricultural operations, yield intelligence and supply planning.",
  theme: {
    primary: "#7E22CE",
    accent: "#84CC16",
    label: "FARM",
  },
  packages: ["professional", "enterprise"],
  landingPath: "/",
  status: "planned",
};
