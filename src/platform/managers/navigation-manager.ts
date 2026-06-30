import type { LucideIcon } from "lucide-react";
import { vyronNavSections } from "@/lib/vyron-navigation";
import {
  canShowSidebar,
  getFeatureForRoute,
  getUpgradePackageLabel,
  isPremiumLocked,
  type FeatureKey,
} from "@/platform/managers/package-manager";
import {
  canAccessPathFromSession,
  getRequiredPermissionForPath,
} from "@/platform/managers/permission-manager";
import type { PlatformNavItemState, PlatformNavSectionState } from "@/platform/types";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export type NavigationContext = {
  packageName: string;
  session: WorkspaceSession | null;
};

function buildNavItem(
  sectionId: string,
  category: string,
  item: { label: string; href: string; icon: LucideIcon },
  context: NavigationContext
): PlatformNavItemState {
  const feature = getFeatureForRoute(item.href, sectionId);
  const permission = getRequiredPermissionForPath(item.href);
  const locked = feature ? isPremiumLocked(context.packageName, feature) : false;
  const permissionDenied =
    context.session && permission ? !canAccessPathFromSession(context.session, item.href) : false;
  const hidden = permissionDenied;
  const discoverable = canShowSidebar(context.packageName, item.href, sectionId);

  return {
    id: `${sectionId}:${item.href}`,
    label: item.label,
    href: item.href,
    category,
    feature,
    permission,
    upgradePackage: feature ? getUpgradePackageLabel(feature) : null,
    locked: discoverable && locked,
    hidden,
  };
}

export function getNavigationForProduct(
  productId: "vyron_cost",
  context: NavigationContext
): PlatformNavSectionState[] {
  if (productId !== "vyron_cost") return [];

  return vyronNavSections
    .map((section) => ({
      id: section.id,
      title: section.section,
      items: section.items.map((item) => buildNavItem(section.id, section.section, item, context)),
    }))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.hidden),
    }))
    .filter((section) => section.items.length > 0);
}

export function getNavigation(context: NavigationContext): PlatformNavSectionState[] {
  return getNavigationForProduct("vyron_cost", context);
}

export function getNavItemFeature(href: string, sectionId?: string): FeatureKey | null {
  return getFeatureForRoute(href, sectionId);
}
