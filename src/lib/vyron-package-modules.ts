export type PackageTier = "Starter" | "Professional" | "Enterprise" | "Demo" | "Professional Demo";

export type PackageModuleKey =
  | "dashboard"
  | "suppliers"
  | "costing"
  | "procurement"
  | "inventory"
  | "manufacturing"
  | "customers"
  | "accounting"
  | "reports"
  | "intelligence"
  | "multi-company"
  | "integrations";

/**
 * V1 GO-LIVE PACKAGE RULES
 *
 * During V1 go-live, Starter must not hide operational V1 modules while clients are being onboarded.
 * Package monetisation can tighten this later, but the live client cannot lose Customers, Invoices,
 * Inventory, Procurement, Manufacturing or Xero while testing/onboarding.
 */
const V1_OPERATIONAL_MODULES: PackageModuleKey[] = [
  "dashboard",
  "suppliers",
  "costing",
  "procurement",
  "inventory",
  "manufacturing",
  "customers",
  "accounting",
  "reports",
  "intelligence",
];

const STARTER_MODULES: PackageModuleKey[] = [...V1_OPERATIONAL_MODULES];

const PROFESSIONAL_MODULES: PackageModuleKey[] = [
  ...V1_OPERATIONAL_MODULES,
  "integrations",
];

const ENTERPRISE_MODULES: PackageModuleKey[] = [
  ...PROFESSIONAL_MODULES,
  "multi-company",
];

function normalizePackageName(packageName: string): string {
  return (packageName || "Professional").trim();
}

export function getPackageModules(packageName: string): PackageModuleKey[] {
  const pkg = normalizePackageName(packageName).toLowerCase();
  if (pkg.includes("enterprise")) return ENTERPRISE_MODULES;
  if (pkg.includes("professional") || pkg.includes("demo")) return PROFESSIONAL_MODULES;
  if (pkg.includes("starter")) return STARTER_MODULES;
  return PROFESSIONAL_MODULES;
}

export function isModuleIncluded(packageName: string, moduleKey: PackageModuleKey): boolean {
  return getPackageModules(packageName).includes(moduleKey);
}

export function packageUpgradeLabel(packageName: string, moduleKey: PackageModuleKey): string {
  const pkg = normalizePackageName(packageName);
  const required =
    moduleKey === "multi-company" || moduleKey === "integrations"
      ? "Enterprise"
      : "Professional";
  return `${required} package required — your workspace is on ${pkg}. Contact VYRON to upgrade.`;
}

/** Section label → module key. */
export const SECTION_MODULE_MAP: Record<string, PackageModuleKey> = {
  SUPPLIERS: "suppliers",
  COSTING: "costing",
  PROCUREMENT: "procurement",
  INVENTORY: "inventory",
  MANUFACTURING: "manufacturing",
  CUSTOMERS: "customers",
  ACCOUNTING: "accounting",
  REPORTS: "reports",
  EXECUTIVE: "intelligence",
  ADMIN: "dashboard",
};

export const MODULE_LABELS: Record<PackageModuleKey, string> = {
  dashboard: "Dashboard",
  suppliers: "Suppliers",
  costing: "Costing",
  procurement: "Procurement",
  inventory: "Inventory",
  manufacturing: "Manufacturing",
  customers: "Customers",
  accounting: "Accounting",
  reports: "Reports",
  intelligence: "Executive Intelligence",
  "multi-company": "Multi-Company",
  integrations: "Integrations",
};
