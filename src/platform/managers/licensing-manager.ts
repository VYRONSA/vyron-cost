import type { VyronProductId } from "@/platform/managers/package-manager";
import { hasFeature } from "@/platform/managers/package-manager";
import type { PlatformLicense, PlatformSubscription, PlatformTenant } from "@/platform/types";
import { isSubscriptionActive } from "@/platform/managers/subscription-manager";
import { getProductDefinition } from "@/platform/products/registry";

export function validateLicense(input: {
  productId: VyronProductId;
  tenant: PlatformTenant;
  subscription: PlatformSubscription;
}): PlatformLicense {
  const product = getProductDefinition(input.productId);
  if (!product) {
    return {
      valid: false,
      productId: input.productId,
      packageName: input.tenant.packageName,
      reason: "Unknown VYRON product.",
    };
  }

  if (product.status === "planned") {
    return {
      valid: false,
      productId: input.productId,
      packageName: input.tenant.packageName,
      reason: `${product.name} is not yet activated for this workspace.`,
    };
  }

  if (input.tenant.status === "Suspended" || input.tenant.status === "Archived") {
    return {
      valid: false,
      productId: input.productId,
      packageName: input.tenant.packageName,
      reason: "Workspace license is suspended or archived.",
    };
  }

  if (!isSubscriptionActive(input.subscription)) {
    return {
      valid: false,
      productId: input.productId,
      packageName: input.tenant.packageName,
      reason: "Subscription is not active.",
    };
  }

  if (!hasFeature(input.tenant.packageName, "dashboard")) {
    return {
      valid: false,
      productId: input.productId,
      packageName: input.tenant.packageName,
      reason: "Package does not include platform access.",
    };
  }

  return {
    valid: true,
    productId: input.productId,
    packageName: input.tenant.packageName,
    reason: null,
  };
}

export function isProductLicensed(
  productId: VyronProductId,
  tenant: PlatformTenant,
  subscription: PlatformSubscription
): boolean {
  return validateLicense({ productId, tenant, subscription }).valid;
}
