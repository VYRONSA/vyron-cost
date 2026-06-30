import type { VyronProductDefinition } from "@/platform/types";
import { VYRON_COST_PRODUCT } from "@/platform/products/vyron-cost";
import { VYRON_CORE_PRODUCT } from "@/platform/products/vyron-core";
import { VYRON_PAY_PRODUCT } from "@/platform/products/vyron-pay";
import { VYRON_FARM_PRODUCT } from "@/platform/products/vyron-farm";
import { VYRON_REACH_PRODUCT } from "@/platform/products/vyron-reach";
import type { VyronProductId } from "@/platform/managers/package-manager";

const PRODUCT_REGISTRY: Record<VyronProductId, VyronProductDefinition> = {
  vyron_cost: VYRON_COST_PRODUCT,
  vyron_core: VYRON_CORE_PRODUCT,
  vyron_pay: VYRON_PAY_PRODUCT,
  vyron_farm: VYRON_FARM_PRODUCT,
  vyron_reach: VYRON_REACH_PRODUCT,
};

export function listProducts(): VyronProductDefinition[] {
  return Object.values(PRODUCT_REGISTRY);
}

export function getProductDefinition(productId: VyronProductId): VyronProductDefinition | null {
  return PRODUCT_REGISTRY[productId] || null;
}

export function getActiveProducts(): VyronProductDefinition[] {
  return listProducts().filter((product) => product.status === "active");
}

export function getPlannedProducts(): VyronProductDefinition[] {
  return listProducts().filter((product) => product.status === "planned");
}
