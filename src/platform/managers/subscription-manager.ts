import type { ActiveClient } from "@/lib/vyron-developer-client";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { resolveBasePackageId } from "@/platform/managers/package-manager";
import type { PlatformSubscription } from "@/platform/types";

function mapWorkspaceStatus(status: ActiveClient["status"]): PlatformSubscription["status"] {
  switch (status) {
    case "Active":
      return "active";
    case "Demo":
      return "trial";
    case "Suspended":
      return "suspended";
    case "Archived":
      return "archived";
    default:
      return "setup";
  }
}

export function resolveSubscriptionFromClient(client: ActiveClient | null): PlatformSubscription {
  const packageName = client?.packageName || "Professional";
  const status = mapWorkspaceStatus(client?.status || "Setup");
  return {
    packageName,
    status: client?.demoMode ? "trial" : status,
    trialEndsAt: null,
    expiresAt: null,
    userLimit: client?.userLimit ?? null,
  };
}

/**
 * ⚠ DISPLAY ONLY — NEVER AUTHORITATIVE FOR ENTITLEMENT.
 *
 * Reads the `vyron_cost_active_client` browser cookie. This function was the
 * source of the AI_ALLOWANCE_EXCEEDED outage: a stale cookie resolved a
 * customer to the zero-limit Starter tier while their database record said
 * Professional. It currently has ZERO callers and must stay that way for any
 * licensing, entitlement, limit or feature decision.
 *
 * For entitlement use:
 *   import { resolveCompanyPackage } from "@/lib/platform/entitlement";
 *
 * See docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md.
 *
 * @deprecated for entitlement. Permitted only for rendering a package label.
 */
export async function resolveSubscription(): Promise<PlatformSubscription> {
  const client = await getServerActiveWorkspace();
  return resolveSubscriptionFromClient(client);
}

export function isSubscriptionActive(subscription: PlatformSubscription): boolean {
  return subscription.status === "active" || subscription.status === "trial" || subscription.status === "setup";
}

export function canChangePackage(
  subscription: PlatformSubscription,
  nextPackageName: string
): { allowed: boolean; reason: string | null } {
  if (!isSubscriptionActive(subscription)) {
    return { allowed: false, reason: "Subscription is not active." };
  }
  if (!nextPackageName.trim()) {
    return { allowed: false, reason: "Package name is required." };
  }
  const current = resolveBasePackageId(subscription.packageName);
  const next = resolveBasePackageId(nextPackageName);
  if (current === next && subscription.packageName === nextPackageName) {
    return { allowed: false, reason: "Workspace is already on this package." };
  }
  return { allowed: true, reason: null };
}
