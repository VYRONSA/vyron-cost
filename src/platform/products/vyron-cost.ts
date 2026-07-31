import type { VyronProductDefinition } from "@/platform/types";
import {
  getPackageComparisonRows,
  getPremiumCapabilityCards,
  type PackageId,
} from "@/platform/managers/package-manager";

const VYRON_COST_PACKAGES: PackageId[] = [
  "starter",
  "professional",
  "enterprise",
  "multi_store_operations",
];

export const VYRON_COST_PRODUCT: VyronProductDefinition = {
  id: "vyron_cost",
  name: "VYRON COST",
  shortName: "COST",
  tagline: "AI cost intelligence, procurement control and inventory accuracy.",
  theme: {
    primary: "#1D6BFF",
    accent: "#7E22CE",
    label: "COST",
  },
  packages: VYRON_COST_PACKAGES,
  landingPath: "/",
  status: "active",
};

export function getVyronCostLandingContent() {
  return {
    product: VYRON_COST_PRODUCT,
    pricingPlans: getPackageComparisonRows(),
    premiumCapabilities: getPremiumCapabilityCards(),
  };
}
