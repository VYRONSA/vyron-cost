/**
 * VYRON Platform — Package Manager
 * Single source of truth for package tiers, feature availability, and upgrade paths.
 */

export type VyronProductId = "vyron_cost" | "vyron_core" | "vyron_pay" | "vyron_farm" | "vyron_reach";

export type PackageId = "starter" | "professional" | "enterprise" | "multi_store_operations";

/** @deprecated Use FeatureKey via hasFeature(). Kept for gradual migration. */
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
  | "integrations"
  | "multi_store";

export const FEATURE_KEYS = [
  "dashboard",
  "contacts",
  "customers",
  "suppliers",
  "supplier_intelligence",
  "document_intelligence",
  "ingredients",
  "finished_goods",
  "recipes",
  "import_centre",
  "inventory",
  "procurement",
  "purchase_orders",
  "manufacturing",
  "production_planning",
  "store_ordering",
  "stores",
  "store_performance",
  "dispatch_board",
  "multi_store",
  "forecasting",
  "store_forecasting",
  "cost_intelligence",
  "advanced_dashboards",
  "developer_tools",
  "xero_sync",
  "reports",
  "integrations",
  "multi_company",
  "customer_invoices",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PackageDefinition = {
  id: PackageId;
  label: string;
  description: string;
  /** Features introduced at this tier (cumulative with lower tiers). */
  features: readonly FeatureKey[];
};

export type PackageComparisonRow = {
  packageId: PackageId;
  label: string;
  price?: string;
  tag?: string;
  recommended?: boolean;
  description: string;
  highlights: string[];
};

export type DashboardWidgetDefinition = {
  id: string;
  feature: FeatureKey;
  label: string;
  href: string;
};

const PACKAGE_LABELS: Record<PackageId, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  multi_store_operations: "Multi-Store Operations",
};

const FEATURE_MIN_PACKAGE: Record<FeatureKey, PackageId> = {
  dashboard: "starter",
  contacts: "starter",
  customers: "starter",
  suppliers: "starter",
  ingredients: "starter",
  finished_goods: "starter",
  recipes: "starter",
  import_centre: "starter",
  reports: "starter",
  inventory: "professional",
  procurement: "professional",
  purchase_orders: "professional",
  manufacturing: "professional",
  xero_sync: "professional",
  supplier_intelligence: "professional",
  document_intelligence: "professional",
  customer_invoices: "professional",
  forecasting: "enterprise",
  store_forecasting: "multi_store_operations",
  cost_intelligence: "enterprise",
  advanced_dashboards: "enterprise",
  multi_company: "enterprise",
  integrations: "enterprise",
  developer_tools: "enterprise",
  multi_store: "multi_store_operations",
  store_ordering: "multi_store_operations",
  stores: "multi_store_operations",
  store_performance: "multi_store_operations",
  dispatch_board: "multi_store_operations",
  production_planning: "multi_store_operations",
};

const PACKAGE_DEFINITIONS: Record<PackageId, PackageDefinition> = {
  starter: {
    id: "starter",
    label: PACKAGE_LABELS.starter,
    description: "Costing foundation for single-site operators.",
    features: [
      "dashboard",
      "contacts",
      "customers",
      "suppliers",
      "ingredients",
      "finished_goods",
      "recipes",
      "import_centre",
      "reports",
    ],
  },
  professional: {
    id: "professional",
    label: PACKAGE_LABELS.professional,
    description: "Procurement, inventory and manufacturing control.",
    features: [
      "inventory",
      "procurement",
      "purchase_orders",
      "manufacturing",
      "xero_sync",
      "supplier_intelligence",
      "document_intelligence",
      "customer_invoices",
    ],
  },
  enterprise: {
    id: "enterprise",
    label: PACKAGE_LABELS.enterprise,
    description: "Forecasting, AI intelligence and multi-company scale.",
    features: [
      "forecasting",
      "cost_intelligence",
      "advanced_dashboards",
      "multi_company",
      "integrations",
      "developer_tools",
    ],
  },
  multi_store_operations: {
    id: "multi_store_operations",
    label: PACKAGE_LABELS.multi_store_operations,
    description: "Multi-store ordering, dispatch and store-driven production.",
    features: [
      "multi_store",
      "store_ordering",
      "stores",
      "store_performance",
      "dispatch_board",
      "production_planning",
      "store_forecasting",
    ],
  },
};

export type IndustryExtensionId =
  | "multi_store_operations"
  | "manufacturing_intelligence"
  | "advanced_procurement"
  | "executive_analytics"
  | "ai_intelligence"
  | "payroll_intelligence"
  | "farm_intelligence";

export type IndustryExtensionDefinition = {
  id: IndustryExtensionId;
  label: string;
  description: string;
  features: readonly FeatureKey[];
  status: "active" | "planned";
};

export const INDUSTRY_EXTENSIONS: Record<IndustryExtensionId, IndustryExtensionDefinition> = {
  multi_store_operations: {
    id: "multi_store_operations",
    label: "Multi-Store Operations",
    description: "Stores, branch ordering, dispatch and store-driven production.",
    features: PACKAGE_DEFINITIONS.multi_store_operations.features,
    status: "active",
  },
  manufacturing_intelligence: {
    id: "manufacturing_intelligence",
    label: "Manufacturing Intelligence",
    description: "Advanced manufacturing analytics and variance intelligence.",
    features: ["manufacturing", "production_planning"],
    status: "planned",
  },
  advanced_procurement: {
    id: "advanced_procurement",
    label: "Advanced Procurement",
    description: "Requisition automation, shortage intelligence and PO engine.",
    features: ["procurement", "purchase_orders"],
    status: "planned",
  },
  executive_analytics: {
    id: "executive_analytics",
    label: "Executive Analytics",
    description: "Boardroom dashboards and advanced executive command centres.",
    features: ["advanced_dashboards", "reports"],
    status: "planned",
  },
  ai_intelligence: {
    id: "ai_intelligence",
    label: "AI Intelligence",
    description: "AI cost intelligence and deterministic insight engines.",
    features: ["cost_intelligence", "forecasting"],
    status: "planned",
  },
  payroll_intelligence: {
    id: "payroll_intelligence",
    label: "Payroll Intelligence",
    description: "Payroll cost intelligence for VYRON PAY tenants.",
    features: [],
    status: "planned",
  },
  farm_intelligence: {
    id: "farm_intelligence",
    label: "Farm Intelligence",
    description: "Agricultural yield and supply intelligence for VYRON FARM.",
    features: [],
    status: "planned",
  },
};

const MULTI_STORE_EXTENSION_FEATURES = new Set<FeatureKey>(
  INDUSTRY_EXTENSIONS.multi_store_operations.features
);

export function isMultiStoreExtensionFeature(feature: FeatureKey): boolean {
  return MULTI_STORE_EXTENSION_FEATURES.has(feature);
}

export function getIndustryExtensionForFeature(feature: FeatureKey): IndustryExtensionDefinition | null {
  for (const extension of Object.values(INDUSTRY_EXTENSIONS)) {
    if (extension.features.includes(feature)) return extension;
  }
  return null;
}

export function listIndustryExtensions(status?: "active" | "planned"): IndustryExtensionDefinition[] {
  const extensions = Object.values(INDUSTRY_EXTENSIONS);
  if (!status) return extensions;
  return extensions.filter((extension) => extension.status === status);
}

const TIER_ORDER: PackageId[] = ["starter", "professional", "enterprise"];

const MODULE_FEATURES: Record<PackageModuleKey, FeatureKey[]> = {
  dashboard: ["dashboard"],
  suppliers: ["suppliers", "supplier_intelligence", "document_intelligence"],
  costing: ["ingredients", "finished_goods", "recipes", "import_centre"],
  procurement: ["procurement", "purchase_orders"],
  inventory: ["inventory"],
  manufacturing: ["manufacturing"],
  customers: ["customers", "contacts", "customer_invoices"],
  accounting: ["xero_sync"],
  reports: ["reports"],
  intelligence: ["cost_intelligence", "forecasting", "advanced_dashboards"],
  "multi-company": ["multi_company"],
  integrations: ["integrations", "xero_sync"],
  multi_store: [
    "multi_store",
    "store_ordering",
    "stores",
    "store_performance",
    "dispatch_board",
    "production_planning",
    "forecasting",
  ],
};

const ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  "/dashboard": "dashboard",
  "/contacts": "contacts",
  "/customers": "customers",
  "/customer-invoices": "customer_invoices",
  "/suppliers": "suppliers",
  "/supplier-intelligence": "supplier_intelligence",
  "/supplier-inflation": "supplier_intelligence",
  "/document-intelligence": "document_intelligence",
  "/document-intelligence/supplier-learning": "document_intelligence",
  "/document-intelligence/price-history/supplier": "document_intelligence",
  "/document-intelligence/settings": "document_intelligence",
  "/email-invoice-inbox": "document_intelligence",
  "/ingredients": "ingredients",
  "/products": "finished_goods",
  "/recipes": "recipes",
  "/import-centre": "import_centre",
  "/categories": "ingredients",
  "/purchase-orders": "purchase_orders",
  "/purchase-orders/list": "purchase_orders",
  "/purchase-orders/approvals": "purchase_orders",
  "/purchase-orders/back-orders": "purchase_orders",
  "/purchase-orders/settings": "purchase_orders",
  "/goods-receipts": "purchase_orders",
  "/procurement": "procurement",
  "/inventory": "inventory",
  "/inventory/stock": "inventory",
  "/inventory/ledger": "inventory",
  "/inventory/counts": "inventory",
  "/inventory/alerts": "inventory",
  "/inventory-intelligence": "inventory",
  "/inventory-ledger": "inventory",
  "/stock-movements": "inventory",
  "/manufacturing": "manufacturing",
  "/manufacturing/runs": "manufacturing",
  "/manufacturing/history": "manufacturing",
  "/manufacturing/finished-goods": "manufacturing",
  "/production-planning": "production_planning",
  "/production-runs": "production_planning",
  "/stores": "stores",
  "/store-orders": "store_ordering",
  "/store-orders/approvals": "store_ordering",
  "/store-orders/picking": "store_ordering",
  "/store-orders/dispatch": "dispatch_board",
  "/store-orders/dashboard": "store_ordering",
  "/store-orders/product-demand": "store_ordering",
  "/store-orders/settings": "store_ordering",
  "/store-performance": "store_performance",
  "/demand-forecast": "forecasting",
  "/store-forecast": "store_forecasting",
  "/integrations/xero": "xero_sync",
  "/reports": "reports",
  "/executive-boardroom": "advanced_dashboards",
  "/cost-intelligence": "cost_intelligence",
  "/business-health": "advanced_dashboards",
  "/early-warning": "advanced_dashboards",
  "/predictive-risk": "advanced_dashboards",
  "/root-cause": "advanced_dashboards",
  "/decisions": "advanced_dashboards",
  "/actions": "advanced_dashboards",
  "/autonomous-command-centre": "advanced_dashboards",
  "/ask-vyron": "cost_intelligence",
  "/execution-centre": "advanced_dashboards",
  "/ai-cost-intelligence": "cost_intelligence",
  "/developer": "developer_tools",
  "/developer/clients": "developer_tools",
  "/developer/setup": "developer_tools",
  "/deployment-readiness": "developer_tools",
  "/admin/company-setup": "dashboard",
  "/admin/users": "dashboard",
  "/admin/imports": "dashboard",
};

const SECTION_DEFAULT_FEATURE: Record<string, FeatureKey> = {
  suppliers: "suppliers",
  costing: "ingredients",
  "master-data": "ingredients",
  procurement: "procurement",
  inventory: "inventory",
  manufacturing: "manufacturing",
  customers: "customers",
  "store-ordering": "multi_store",
  accounting: "xero_sync",
  reports: "reports",
  executive: "cost_intelligence",
  admin: "dashboard",
};

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { id: "store-orders", feature: "store_ordering", label: "Store Ordering", href: "/store-orders/dashboard" },
  { id: "inventory", feature: "inventory", label: "Inventory Intelligence", href: "/inventory-ledger" },
  { id: "procurement", feature: "procurement", label: "Procurement Intelligence", href: "/procurement" },
  { id: "purchase-orders", feature: "purchase_orders", label: "Purchase Order Operations", href: "/purchase-orders" },
  { id: "demand-forecast", feature: "forecasting", label: "Demand Forecasting", href: "/demand-forecast" },
  { id: "store-forecast", feature: "store_forecasting", label: "Store Forecasting", href: "/store-forecast" },
  { id: "cost-intelligence", feature: "cost_intelligence", label: "AI Cost Intelligence", href: "/cost-intelligence" },
  { id: "production-planning", feature: "production_planning", label: "Production Planning", href: "/production-planning" },
];

function normalizePackageName(packageName: string): string {
  return (packageName || PACKAGE_LABELS.professional).trim();
}

function packageNameIncludes(name: string, token: string): boolean {
  return name.toLowerCase().includes(token.toLowerCase());
}

export function resolveBasePackageId(packageName: string): PackageId {
  const name = normalizePackageName(packageName).toLowerCase();
  if (packageNameIncludes(name, "starter")) return "starter";
  if (packageNameIncludes(name, "enterprise")) return "enterprise";
  if (packageNameIncludes(name, "professional") || packageNameIncludes(name, "demo")) return "professional";
  return "professional";
}

export function hasMultiStorePackage(packageName: string): boolean {
  const name = normalizePackageName(packageName).toLowerCase();
  return (
    packageNameIncludes(name, "multi-store") ||
    packageNameIncludes(name, "multistore") ||
    packageNameIncludes(name, "multi store")
  );
}

function featuresForBaseTier(baseTier: PackageId): Set<FeatureKey> {
  const features = new Set<FeatureKey>();
  const stopIndex = TIER_ORDER.indexOf(baseTier);
  for (let index = 0; index <= stopIndex; index += 1) {
    for (const feature of PACKAGE_DEFINITIONS[TIER_ORDER[index]].features) {
      features.add(feature);
    }
  }
  return features;
}

export function resolveWorkspaceFeatures(packageName: string): Set<FeatureKey> {
  const baseTier = resolveBasePackageId(packageName);
  const features = featuresForBaseTier(baseTier);

  if (hasMultiStorePackage(packageName)) {
    for (const feature of PACKAGE_DEFINITIONS.multi_store_operations.features) {
      features.add(feature);
    }
  }

  return features;
}

export function hasFeature(packageName: string, feature: FeatureKey): boolean {
  return resolveWorkspaceFeatures(packageName).has(feature);
}

export function hasModule(packageName: string, moduleKey: PackageModuleKey): boolean {
  const moduleFeatures = MODULE_FEATURES[moduleKey] || [];
  return moduleFeatures.some((feature) => hasFeature(packageName, feature));
}

export function getFeatureForRoute(route: string, sectionId?: string): FeatureKey | null {
  if (ROUTE_FEATURE_MAP[route]) return ROUTE_FEATURE_MAP[route];

  const prefixes = Object.entries(ROUTE_FEATURE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, feature] of prefixes) {
    if (route === prefix || route.startsWith(`${prefix}/`)) return feature;
  }

  if (sectionId && SECTION_DEFAULT_FEATURE[sectionId]) {
    return SECTION_DEFAULT_FEATURE[sectionId];
  }

  return null;
}

export function canAccessRoute(packageName: string, route: string, sectionId?: string): boolean {
  const feature = getFeatureForRoute(route, sectionId);
  if (!feature) return true;
  return hasFeature(packageName, feature);
}

/** Sidebar items are always discoverable. */
export function canShowSidebar(_packageName: string, _href: string, _sectionId?: string): boolean {
  return true;
}

export function isPremiumLocked(packageName: string, feature: FeatureKey): boolean {
  return !hasFeature(packageName, feature);
}

export function isRoutePremiumLocked(packageName: string, route: string, sectionId?: string): boolean {
  const feature = getFeatureForRoute(route, sectionId);
  if (!feature) return false;
  return isPremiumLocked(packageName, feature);
}

export function getUpgradePackage(feature: FeatureKey): PackageId {
  return FEATURE_MIN_PACKAGE[feature];
}

export function getUpgradePackageLabel(feature: FeatureKey): string {
  return PACKAGE_LABELS[getUpgradePackage(feature)];
}

export function getFeatureTooltip(feature: FeatureKey): string {
  if (isMultiStoreExtensionFeature(feature)) {
    return "Available with the Multi-Store Operations package.";
  }
  return `Available in the ${getUpgradePackageLabel(feature)} package.`;
}

export function getModuleTooltip(moduleKey: PackageModuleKey): string {
  const features = MODULE_FEATURES[moduleKey];
  if (!features?.length) return "Available on a higher package.";
  return getFeatureTooltip(features[0]);
}

export function getUpgradeMessage(packageName: string, feature: FeatureKey): string {
  const current = PACKAGE_LABELS[resolveBasePackageId(packageName)];
  const required = getUpgradePackageLabel(feature);
  return `${required} package required — your workspace is on ${current}. Contact VYRON to upgrade.`;
}

export function getModulePrimaryFeature(moduleKey: PackageModuleKey): FeatureKey | null {
  return MODULE_FEATURES[moduleKey]?.[0] || null;
}

export function getPackageModules(packageName: string): PackageModuleKey[] {
  return (Object.keys(MODULE_FEATURES) as PackageModuleKey[]).filter((moduleKey) =>
    hasModule(packageName, moduleKey)
  );
}

export function getPackageDefinitions(): PackageDefinition[] {
  return TIER_ORDER.map((id) => PACKAGE_DEFINITIONS[id]).concat(PACKAGE_DEFINITIONS.multi_store_operations);
}

export function getPackageComparisonRows(): PackageComparisonRow[] {
  return [
    {
      packageId: "starter",
      label: PACKAGE_LABELS.starter,
      price: "R1,499",
      tag: "Costing Foundation",
      description: PACKAGE_DEFINITIONS.starter.description,
      highlights: [
        "Contacts, customers and suppliers",
        "Ingredients, finished goods and recipes",
        "Import centre and costing reports",
      ],
    },
    {
      packageId: "professional",
      label: PACKAGE_LABELS.professional,
      price: "R3,499",
      tag: "Recommended",
      recommended: true,
      description: PACKAGE_DEFINITIONS.professional.description,
      highlights: [
        "Everything in Starter",
        "Inventory, procurement and purchase orders",
        "Manufacturing runs and Xero sync",
        "Supplier and document intelligence",
      ],
    },
    {
      packageId: "enterprise",
      label: PACKAGE_LABELS.enterprise,
      price: "Custom",
      tag: "Scale",
      description: PACKAGE_DEFINITIONS.enterprise.description,
      highlights: [
        "Everything in Professional",
        "Demand forecasting and AI cost intelligence",
        "Advanced dashboards and multi-company",
      ],
    },
    {
      packageId: "multi_store_operations",
      label: PACKAGE_LABELS.multi_store_operations,
      price: "Custom",
      tag: "Multi-Store",
      description: PACKAGE_DEFINITIONS.multi_store_operations.description,
      highlights: [
        "Everything in Enterprise",
        "Stores, store orders and dispatch",
        "Store performance and store forecasting",
        "Production planning from store demand",
      ],
    },
  ];
}

export function getPremiumCapabilityCards(): Array<{ feature: FeatureKey; title: string; body: string }> {
  return [
    {
      feature: "multi_store",
      title: "Multi-Store Operations",
      body: "Stores master, branch ordering and dispatch across your retail or franchise network.",
    },
    {
      feature: "store_ordering",
      title: "Store Ordering",
      body: "Draft to delivered workflow with approvals, picking, dispatch and margin controls.",
    },
    {
      feature: "production_planning",
      title: "Production Planning",
      body: "Aggregate store demand into production runs with BOM ingredient requirements.",
    },
    {
      feature: "inventory",
      title: "Inventory Intelligence",
      body: "Ledger, movements, counts and stock risk signals tied to live cost data.",
    },
    {
      feature: "procurement",
      title: "Procurement Intelligence",
      body: "Requisitions from shortages, supplier recommendations and shortage exposure.",
    },
    {
      feature: "purchase_orders",
      title: "Purchase Order Automation",
      body: "Generate POs from requisitions, receive stock and reconcile inventory automatically.",
    },
    {
      feature: "forecasting",
      title: "Demand Forecasting",
      body: "Product and procurement forecasts from real ordering behaviour.",
    },
    {
      feature: "store_forecasting",
      title: "Store Forecasting",
      body: "Store-level demand forecasts driven by branch ordering patterns.",
    },
    {
      feature: "cost_intelligence",
      title: "AI Cost Intelligence",
      body: "Deterministic insights with problem, impact and recommended actions.",
    },
  ];
}

export function packageIncludesFeature(packageId: PackageId, feature: FeatureKey): boolean {
  if (PACKAGE_DEFINITIONS[packageId].features.includes(feature)) return true;
  const minPackage = FEATURE_MIN_PACKAGE[feature];
  if (packageId === minPackage) return true;
  if (packageId === "multi_store_operations") {
    return featuresForBaseTier("enterprise").has(feature) || PACKAGE_DEFINITIONS.multi_store_operations.features.includes(feature);
  }
  const packageIndex = TIER_ORDER.indexOf(packageId);
  const minIndex = TIER_ORDER.indexOf(minPackage);
  if (packageIndex >= 0 && minIndex >= 0 && packageIndex >= minIndex) return true;
  return false;
}

/** @deprecated Use getUpgradeMessage(packageName, feature) */
export function packageUpgradeLabel(packageName: string, moduleKey: PackageModuleKey): string {
  const feature = MODULE_FEATURES[moduleKey]?.[0];
  if (!feature) return getUpgradeMessage(packageName, "dashboard");
  return getUpgradeMessage(packageName, feature);
}

/** @deprecated Use getModuleTooltip(moduleKey) */
export function packageModuleTooltip(moduleKey: PackageModuleKey): string {
  return getModuleTooltip(moduleKey);
}

/** @deprecated Use hasModule() */
export function isModuleIncluded(packageName: string, moduleKey: PackageModuleKey): boolean {
  return hasModule(packageName, moduleKey);
}

export const SECTION_MODULE_MAP: Record<string, PackageModuleKey> = {
  SUPPLIERS: "suppliers",
  COSTING: "costing",
  PROCUREMENT: "procurement",
  INVENTORY: "inventory",
  MANUFACTURING: "manufacturing",
  CUSTOMERS: "customers",
  "STORE ORDERING": "multi_store",
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
  multi_store: "Multi-Store Operations",
};

export type PackageTier = "Starter" | "Professional" | "Enterprise" | "Demo" | "Professional Demo";
