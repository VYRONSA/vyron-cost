import type { PackageId } from "@/platform/managers/package-manager";
import { hasMultiStorePackage, resolveBasePackageId } from "@/platform/managers/package-manager";
import type { AiAllowanceStatus, AiTierAllowance } from "@/lib/platform/ai/AiUsageTypes";

// Placeholder monthly AI caps per tier. 1 credit = $0.01 USD estimated cost.
// These are config constants, not commercial decisions — tune freely.
export const AI_TIER_ALLOWANCES: Record<PackageId, AiTierAllowance> = {
  starter: { packageId: "starter", monthlyCredits: 0, maxSpendUsd: 0, maxRequests: 0 },
  professional: { packageId: "professional", monthlyCredits: 500, maxSpendUsd: 25, maxRequests: 1000 },
  enterprise: { packageId: "enterprise", monthlyCredits: 2500, maxSpendUsd: 125, maxRequests: 5000 },
  multi_store_operations: { packageId: "multi_store_operations", monthlyCredits: 5000, maxSpendUsd: 250, maxRequests: 10000 },
};

export function resolveTierAllowance(packageName: string, override?: Partial<AiTierAllowance>): AiTierAllowance {
  const packageId: PackageId = hasMultiStorePackage(packageName) ? "multi_store_operations" : resolveBasePackageId(packageName);
  const base = AI_TIER_ALLOWANCES[packageId];

  // Only apply override keys that are actually set. A naive `{ ...base, ...override }`
  // spread copies `undefined`-valued keys too (e.g. { monthlyCredits: undefined }),
  // which silently wipes the tier default instead of leaving it in place.
  const definedOverride: Partial<AiTierAllowance> = {};
  if (override) {
    for (const key of Object.keys(override) as Array<keyof AiTierAllowance>) {
      const value = override[key];
      if (value !== undefined && value !== null) {
        (definedOverride as Record<string, unknown>)[key] = value;
      }
    }
  }

  return { ...base, ...definedOverride, packageId };
}

export function evaluateAllowanceStatus(percentUsed: number): AiAllowanceStatus {
  if (percentUsed >= 100) return "exceeded";
  if (percentUsed >= 95) return "warning_95";
  if (percentUsed >= 80) return "warning_80";
  return "ok";
}
