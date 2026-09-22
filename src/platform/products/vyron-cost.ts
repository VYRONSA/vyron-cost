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
  "full",
];

export const VYRON_COST_PRODUCT: VyronProductDefinition = {
  id: "vyron_cost",
  name: "VOLORA",
  shortName: "COST",
  tagline: "AI cost intelligence, procurement control and inventory accuracy.",
  theme: {
    primary: "#1F4757",
    accent: "#163A48",
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
