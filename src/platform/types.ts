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

export type PlatformLicense = {
  valid: boolean;
  productId: VyronProductId;
  packageName: string;
  reason: string | null;
};

export type PlatformAccessContext = {
  productId: VyronProductId;
  tenant: PlatformTenant;
  subscription: PlatformSubscription;
  license: PlatformLicense;
  session: WorkspaceSession | null;
};

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
