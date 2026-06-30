/**
 * VYRON Platform — public API
 * Reusable infrastructure for all VYRON products.
 */

export * from "@/platform/types";

export * from "@/platform/managers/package-manager";
export * from "@/platform/managers/tenant-manager";
export * from "@/platform/managers/subscription-manager";
export * from "@/platform/managers/licensing-manager";
export * from "@/platform/managers/feature-flag-manager";
export * from "@/platform/managers/feature-manager";
export * from "@/platform/managers/permission-manager";
export * from "@/platform/managers/navigation-manager";
export * from "@/platform/managers/sidebar-manager";
export * from "@/platform/managers/route-manager";
export * from "@/platform/managers/command-centre-manager";
export * from "@/platform/managers/dashboard-manager";
export * from "@/platform/managers/identity-manager";
export * from "@/platform/managers/workflow-manager";
export * from "@/platform/managers/notification-manager";
export * from "@/platform/managers/audit-manager";
export * from "@/platform/managers/integration-manager";
export * from "@/platform/managers/ai-services";

export {
  PERMISSION_GROUPS,
  canAccessPath,
  getRequiredPermissionForPath,
  hasPermission as hasRolePermission,
  mergePermissions,
  resolveEffectivePermissions,
  resolvePermissionKey,
  sessionHasPermission,
  hasPermissionFromSession,
  type PermissionGroup,
  type PermissionKey,
  type WorkspacePermissionSession,
  type WorkspaceUserRole,
} from "@/platform/managers/permission-manager";

export * from "@/platform/products/registry";
export * from "@/platform/products/vyron-cost";
export * from "@/platform/landing/framework";

import { hasFeature as hasPackageFeature } from "@/platform/managers/package-manager";
import { hasPermissionFromSession } from "@/platform/managers/permission-manager";
import { resolveTenant } from "@/platform/managers/tenant-manager";
import { alignTenantCompanyId, requireTenantCompanyId } from "@/platform/managers/tenant-manager";
import { getNavigation } from "@/platform/managers/navigation-manager";
import { getDashboardWidgets } from "@/platform/managers/dashboard-manager";
import { isFeatureEnabled } from "@/platform/managers/feature-flag-manager";
import type { FeatureKey } from "@/platform/managers/package-manager";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

/** @deprecated Prefer hasFeature(packageName, feature) or isFeatureEnabled(). */
export function hasPackage(packageName: string, feature: FeatureKey): boolean {
  return hasPackageFeature(packageName, feature);
}

export function hasPermission(
  session: WorkspaceSession | null,
  permission: string
): boolean {
  return hasPermissionFromSession(session, permission);
}

export {
  resolveTenant,
  requireTenantCompanyId,
  alignTenantCompanyId,
  hasPackageFeature as hasFeature,
  getNavigation,
  getDashboardWidgets as getWidgets,
  isFeatureEnabled,
};
