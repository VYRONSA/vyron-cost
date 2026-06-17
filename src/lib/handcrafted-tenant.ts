import type { Ingredient, Product, ProductCostLine, Recipe, RecipeItem, Category, BatchRun } from "@/lib/vyron-cost-data";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import type { CommandKpis, AiFeedItem, RecoveryOpportunity } from "@/lib/vyron-demo-data";
import tenantJson from "../../data/generated/handcrafted-tenant.json";

type HandcraftedLeakageFinding = {
  id: string;
  finding_type: string | null;
  title: string | null;
  description: string | null;
  estimated_monthly_loss: number | null;
  severity: string | null;
  status: string | null;
  branch_name: string | null;
  category_name: string | null;
  supplier_name: string | null;
};

export type HandcraftedCompany = {
  id: string;
  company_name: string;
  trading_name: string;
  legal_name: string;
  subscription_plan: string;
  subscription_status: string;
  currency_code: string;
  vat_percent: number;
  logo_url: string;
  primary_color: string;
  contact_email?: string;
  region?: string;
};

export type HandcraftedTenantPayload = {
  meta: {
    imported: boolean;
    imported_at?: string;
    company?: string;
    product_count?: number;
    recipe_count?: number;
    ingredient_count?: number;
    message?: string;
    sources?: Record<string, string>;
  };
  company: HandcraftedCompany;
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipe_items: RecipeItem[];
  product_cost_lines: ProductCostLine[];
  product_categories: Category[];
  recipe_categories: Category[];
  batch_runs: BatchRun[];
  product_intelligence: ProductIntelligenceRow[];
  command_kpis: CommandKpis;
  ai_feed: AiFeedItem[];
  recovery_opportunities: RecoveryOpportunity[];
  roi: { platformCostAnnual: number; recoverableAnnual: number; roiMultiple: number };
};

export const HANDCRAFTED_COMPANY = {
  id: "handcrafted-fp",
  company_name: "Handcrafted Food Products",
  trading_name: "Metanoia Hospitality Pty Ltd",
  legal_name: "Metanoia Hospitality Pty Ltd",
  logo_url: "/clients/handcrafted/logo.svg",
  primary_color: "#10b981",
};

export function isHandcraftedTenantEnabled() {
  return process.env.NEXT_PUBLIC_VYRON_TENANT !== "off";
}

export function loadHandcraftedTenant(): HandcraftedTenantPayload {
  return tenantJson as unknown as HandcraftedTenantPayload;
}

export function isHandcraftedDataReady() {
  const tenant = loadHandcraftedTenant();
  return Boolean(tenant.meta?.imported && tenant.products?.length);
}

export function shouldUseHandcraftedData() {
  return isHandcraftedTenantEnabled() && isHandcraftedDataReady();
}

/** @deprecated Use shouldUseWorkspaceDemoData() from vyron-workspace-context for scoped data. */
export function shouldUseHandcraftedDataSync() {
  return shouldUseHandcraftedData();
}

export function getHandcraftedCompany() {
  const tenant = loadHandcraftedTenant();
  return tenant.company ?? HANDCRAFTED_COMPANY;
}

export function getHandcraftedProducts() {
  return loadHandcraftedTenant().products ?? [];
}

export function getHandcraftedIngredients() {
  return loadHandcraftedTenant().ingredients ?? [];
}

export function getHandcraftedRecipes() {
  return loadHandcraftedTenant().recipes ?? [];
}

export function getHandcraftedRecipeItems() {
  return loadHandcraftedTenant().recipe_items ?? [];
}

export function getHandcraftedProductCostLines() {
  return loadHandcraftedTenant().product_cost_lines ?? [];
}

export function getHandcraftedCategories() {
  const tenant = loadHandcraftedTenant();
  return [...(tenant.product_categories ?? []), ...(tenant.recipe_categories ?? [])];
}

export function getHandcraftedBatchRuns() {
  return loadHandcraftedTenant().batch_runs ?? [];
}

export function getHandcraftedProductIntelligence() {
  return loadHandcraftedTenant().product_intelligence ?? [];
}

export function getHandcraftedCommandKpis() {
  const kpis = loadHandcraftedTenant().command_kpis;
  return kpis?.recoverableAnnual ? kpis : null;
}

export function getHandcraftedAiFeed() {
  return loadHandcraftedTenant().ai_feed ?? [];
}

export function getHandcraftedRecoveryOpportunities() {
  return loadHandcraftedTenant().recovery_opportunities ?? [];
}

export function getHandcraftedRoi() {
  return loadHandcraftedTenant().roi ?? { platformCostAnnual: 60000, recoverableAnnual: 0, roiMultiple: 0 };
}

export function getHandcraftedLeakageFindings(): HandcraftedLeakageFinding[] {
  const intel = getHandcraftedProductIntelligence();
  const below = intel.filter((p) => Number(p.gp_gap || 0) > 0);
  const findings: HandcraftedLeakageFinding[] = below.slice(0, 5).map((p, i) => ({
    id: `hfp-lf-${i}`,
    finding_type: "Margin Erosion",
    title: `${p.product_name} below target GP`,
    description: `Actual GP ${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}% target`,
    estimated_monthly_loss: Number(p.monthly_risk_value || 0),
    severity: String(p.risk_level || "High"),
    status: "Open",
    branch_name: null,
    category_name: String(p.category || null),
    supplier_name: null,
  }));

  const kpis = loadHandcraftedTenant().command_kpis;
  if (kpis.duplicateInvoiceRisks > 0) {
    findings.push({
      id: "hfp-lf-dup",
      finding_type: "Duplicate Invoice",
      title: "Duplicate supplier invoice risk",
      description: "Finance review — possible duplicate payment on protein supplier",
      estimated_monthly_loss: kpis.duplicateInvoiceRisks,
      severity: "Critical",
      status: "Investigate",
      branch_name: null,
      category_name: null,
      supplier_name: "Primary protein supplier",
    });
  }

  if (kpis.supplierInflationExposure > 0) {
    findings.push({
      id: "hfp-lf-inf",
      finding_type: "Supplier Inflation",
      title: "Imported ingredient inflation exposure",
      description: "Costing workbooks show protein and packaging movement",
      estimated_monthly_loss: kpis.supplierInflationExposure,
      severity: "High",
      status: "Open",
      branch_name: null,
      category_name: "Protein",
      supplier_name: null,
    });
  }

  const batches = getHandcraftedBatchRuns().filter((b) => b.status === "Variance");
  for (const b of batches.slice(0, 2)) {
    findings.push({
      id: `hfp-lf-w-${b.id}`,
      finding_type: "Wastage Loss",
      title: `Batch variance — ${b.recipe_name_snapshot}`,
      description: `Production batch ${b.batch_number} yield below plan`,
      estimated_monthly_loss: Math.round(Number(b.actual_cost || 0) - Number(b.planned_cost || 0)) || 4200,
      severity: "Medium",
      status: "Open",
      branch_name: "Production",
      category_name: null,
      supplier_name: null,
    });
  }

  return findings;
}
