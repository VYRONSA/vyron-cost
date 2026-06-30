import type { VyronProductId } from "@/platform/managers/package-manager";
import { getProductDefinition } from "@/platform/products/registry";
import { getVyronCostLandingContent } from "@/platform/products/vyron-cost";

export function getProductLandingContent(productId: VyronProductId) {
  switch (productId) {
    case "vyron_cost":
      return getVyronCostLandingContent();
    default: {
      const product = getProductDefinition(productId);
      return {
        product,
        pricingPlans: [],
        premiumCapabilities: [],
      };
    }
  }
}

export function getActiveProductLandingPages() {
  return getProductLandingContent("vyron_cost");
}
