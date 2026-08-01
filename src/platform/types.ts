import type { ActiveClient } from "@/lib/vyron-developer-client";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import type { FeatureKey, PackageId, VyronProductId } from "@/platform/managers/package-manager";
import type { IndustryExtensionId } from "@/platform/managers/package-manager";

export type PlatformTenant = {
  workspaceId: string | null;
  companyId: string | null;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: ActiveClient["status"];
  demoMode: boolean;
  multiCompany: boolean;
  multiStore: boolean;
};

export type PlatformSubscription = {
  packageName: string;
  status: "active" | "trial" | "setup" | "suspended" | "expired" | "archived";
  trialEndsAt: string | null;
  expiresAt: string | null;
  userLimit: number | null;
};

/**
 * Product licensing moved to the Platform Entitlement Service.
 *
 * `PlatformLicense` and `PlatformAccessContext` were removed with
 * `platform/managers/licensing-manager.ts`. Both were unused, and
 * `PlatformAccessContext` carried `tenant` and `subscription` — objects built
 * from the browser cookie — which is the pattern this architecture eliminates.
 *
 * Use `resolveProductLicence(companyId, productId)` from
 * `@/lib/platform/entitlement`, which returns `ProductLicence` and resolves
 * everything from the database. See docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md.
 */

export type PlatformNavItemState = {
  id: string;
  label: string;
  href: string;
  category: string;
  feature: FeatureKey | null;
  permission: string | null;
  upgradePackage: string | null;
  locked: boolean;
  hidden: boolean;
};

export type PlatformNavSectionState = {
  id: string;
  title: string;
  items: PlatformNavItemState[];
};

export type PlatformWidgetState = {
  id: string;
  label: string;
  href: string;
  feature: FeatureKey;
  locked: boolean;
  visible: boolean;
  upgradePackage: string;
};

export type VyronProductTheme = {
  primary: string;
  accent: string;
  label: string;
};

export type VyronProductDefinition = {
  id: VyronProductId;
  name: string;
  shortName: string;
  tagline: string;
  theme: VyronProductTheme;
  packages: PackageId[];
  landingPath: string;
  status: "active" | "planned";
};
