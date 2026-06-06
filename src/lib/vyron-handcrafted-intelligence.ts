import { supabase } from "@/lib/supabase";
import {
  calculateGpPercent,
  calculateMovementPercent,
  calculateSuggestedPrice,
  type Ingredient,
  type Product,
  type ProductCostLine,
  type Supplier,
} from "@/lib/vyron-cost-data";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import type { LeakageFinding } from "@/lib/vyron-leakage-intelligence-data";
import type {
  ActionGroups,
  AiFeedItem,
  CommandKpis,
  ProductionIntelSection,
  RecoveryOpportunity,
  SupplierInflationRow,
} from "@/lib/vyron-demo-data";
import { isHandcraftedDataReady, loadHandcraftedTenant } from "@/lib/handcrafted-tenant";

export const HANDCRAFTED_COMPANY_ID = "48002864-8800-4000-9000-000000000001";

const MONTHLY_UNITS = 800;
const PLATFORM_COST_ANNUAL = 60000;

export const HANDCRAFTED_DEMO_FALLBACK_KPIS: CommandKpis = {
  moneyAtRisk: 147252,
  estimatedMonthlyLeakage: 147252,
  estimatedAnnualLeakage: 1767024,
  supplierInflationExposure: 428400,
  productsBelowGp: 54460,
  duplicateInvoiceRisks: 12268,
  wastageLosses: 18420,
  procurementAnomalies: 15360,
  recoverableMonthly: 106021,
  recoverableAnnual: 1272252,
  recoveryRatePercent: 72,
  pendingActions: 9,
};

export type HandcraftedDataBundle = {
  products: Product[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  costLines: ProductCostLine[];
};

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    company_id: String(row.company_id || HANDCRAFTED_COMPANY_ID),
    product_name: String(row.product_name || ""),
    category: String(row.category || "General"),
    status: String(row.status || "Active"),
    selling_price: Number(row.selling_price || 0),
    total_cost: Number(row.total_cost || 0),
    target_gp: Number(row.target_gp || 40),
    salary_cost: Number(row.salary_cost || 0),
    packaging_cost: Number(row.packaging_cost || 0),
    overhead_cost: Number(row.overhead_cost || 0),
    wastage_percent: Number(row.wastage_percent || 0),
    extracted_line_count: Number(row.extracted_line_count || 0),
  };
}

function mapIngredient(row: Record<string, unknown>): Ingredient {
  return {
    id: String(row.id),
    company_id: String(row.company_id || HANDCRAFTED_COMPANY_ID),
    ingredient_name: String(row.ingredient_name || ""),
    category: String(row.category || "General"),
    purchase_unit: String(row.purchase_unit || "unit"),
    recipe_unit: String(row.recipe_unit || "unit"),
    purchase_cost: Number(row.purchase_cost || 0),
    previous_cost: Number(row.previous_cost || row.purchase_cost || 0),
    yield_type: String(row.yield_type || "standard"),
    yield_percent: Number(row.yield_percent || 100),
    true_unit_cost: Number(row.true_unit_cost || row.purchase_cost || 0),
    current_alert: row.current_alert ? String(row.current_alert) : null,
  };
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    company_id: String(row.company_id || HANDCRAFTED_COMPANY_ID),
    supplier_name: String(row.supplier_name || ""),
    category: String(row.category || "General"),
    contact_email: row.contact_email ? String(row.contact_email) : null,
    invoice_email: row.invoice_email ? String(row.invoice_email) : null,
    risk_status: String(row.risk_status || "Stable"),
    last_price_movement: Number(row.last_price_movement || 0),
  };
}

function mapCostLine(row: Record<string, unknown>): ProductCostLine {
  return {
    id: String(row.id),
    company_id: String(row.company_id || HANDCRAFTED_COMPANY_ID),
    product_id: row.product_id ? String(row.product_id) : null,
    product_name: row.product_name ? String(row.product_name) : null,
    line_type: String(row.line_type || "Ingredient"),
    line_name: String(row.line_name || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "unit"),
    unit_cost: Number(row.unit_cost || 0),
    wastage_percent: Number(row.wastage_percent || 0),
    line_cost: Number(row.line_cost || row.line_cost_imported || 0),
    line_cost_imported: Number(row.line_cost_imported || row.line_cost || 0),
    source_sheet: row.source_sheet ? String(row.source_sheet) : null,
    source_row: row.source_row != null ? Number(row.source_row) : null,
    raw_row: row.raw_row ? String(row.raw_row) : null,
  };
}

async function fetchSupabaseBundle(): Promise<HandcraftedDataBundle | null> {
  if (!supabase) return null;

  const [productsRes, ingredientsRes, suppliersRes, linesRes] = await Promise.all([
    supabase
      .from("vyron_cost_products")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .order("product_name", { ascending: true })
      .limit(500),
    supabase
      .from("vyron_cost_ingredients")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .order("ingredient_name", { ascending: true })
      .limit(500),
    supabase
      .from("vyron_cost_suppliers")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .order("supplier_name", { ascending: true })
      .limit(200),
    supabase
      .from("vyron_cost_product_cost_lines")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .order("product_name", { ascending: true })
      .limit(5000),
  ]);

  const products = (productsRes.data || []).map((r) => mapProduct(r as Record<string, unknown>));
  if (!products.length) return null;

  return {
    products,
    ingredients: (ingredientsRes.data || []).map((r) => mapIngredient(r as Record<string, unknown>)),
    suppliers: (suppliersRes.data || []).map((r) => mapSupplier(r as Record<string, unknown>)),
    costLines: (linesRes.data || []).map((r) => mapCostLine(r as Record<string, unknown>)),
  };
}

function bundleFromJson(): HandcraftedDataBundle | null {
  if (!isHandcraftedDataReady()) return null;
  const tenant = loadHandcraftedTenant();
  if (!tenant?.products?.length) return null;
  return {
    products: tenant.products,
    ingredients: tenant.ingredients,
    suppliers: [],
    costLines: tenant.product_cost_lines,
  };
}

export async function loadHandcraftedBundle(): Promise<HandcraftedDataBundle | null> {
  const fromDb = await fetchSupabaseBundle();
  if (fromDb) return fromDb;
  return bundleFromJson();
}

export async function isHandcraftedLiveDataReady() {
  const bundle = await loadHandcraftedBundle();
  return Boolean(bundle?.products.length);
}

function riskLevel(gpGap: number) {
  if (gpGap >= 10) return "Critical";
  if (gpGap >= 5) return "High";
  if (gpGap >= 2) return "Medium";
  return "Low";
}

export function buildProductIntelligenceRows(products: Product[]): ProductIntelligenceRow[] {
  return products
    .filter((p) => p.product_name && p.total_cost > 0)
    .map((p) => {
      const selling = Number(p.selling_price || 0);
      const cost = Number(p.total_cost || 0);
      const targetGp = Number(p.target_gp || 40);
      const suggested = calculateSuggestedPrice(cost, targetGp);
      const actualGp = selling > 0 ? calculateGpPercent(selling, cost) : 0;
      const gpGap =
        cost > 0
          ? selling > 0
            ? Math.max(0, targetGp - actualGp)
            : Math.max(targetGp * 0.55, targetGp - actualGp)
          : 0;
      const monthlyRisk =
        gpGap > 0 && cost > 0
          ? selling > 0
            ? Math.max(0, (suggested - selling) * MONTHLY_UNITS)
            : Math.max(cost * MONTHLY_UNITS * 0.14, suggested * MONTHLY_UNITS * (gpGap / 100) * 0.45)
          : 0;

      return {
        id: `pi-${p.id}`,
        product_id: p.id,
        product_name: p.product_name,
        category: p.category,
        selling_price: selling,
        total_cost: cost,
        target_gp: targetGp,
        actual_gp: actualGp,
        gp_gap: gpGap,
        suggested_price: suggested,
        monthly_units_estimate: MONTHLY_UNITS,
        monthly_risk_value: monthlyRisk,
        risk_level: riskLevel(gpGap),
        action_required: gpGap > 0 ? "Increase Price" : "Monitor",
      };
    })
    .sort((a, b) => Number(b.monthly_risk_value || 0) - Number(a.monthly_risk_value || 0));
}

function computeInflationExposure(ingredients: Ingredient[]) {
  return ingredients.reduce((sum, ing) => {
    const prev = Number(ing.previous_cost || ing.purchase_cost);
    const cur = Number(ing.purchase_cost);
    if (prev <= 0 || cur <= prev) return sum;
    return sum + (cur - prev) * 1200;
  }, 0);
}

function computeWastageExposure(costLines: ProductCostLine[]) {
  return costLines.reduce((sum, line) => {
    const base = Number(line.line_cost || line.line_cost_imported || 0);
    const wastage = Number(line.wastage_percent || 0);
    if (wastage <= 0) return sum;
    return sum + base * (wastage / 100);
  }, 0);
}

function computePackagingExposure(costLines: ProductCostLine[]) {
  return costLines
    .filter((l) => /pack/i.test(String(l.line_type)))
    .reduce((sum, l) => sum + Number(l.line_cost || l.line_cost_imported || 0), 0);
}

function deriveBaselineMonthlyLeakage(bundle: HandcraftedDataBundle) {
  const productCostTotal = bundle.products.reduce((s, p) => s + Number(p.total_cost || 0), 0);
  const lineCostTotal = bundle.costLines.reduce(
    (s, l) => s + Number(l.line_cost || l.line_cost_imported || 0),
    0
  );
  const costBase = Math.max(productCostTotal, lineCostTotal);
  if (costBase <= 0) return 0;
  return Math.round(costBase * 0.065);
}

export function ensureDemoKpis(kpis: CommandKpis, bundle?: HandcraftedDataBundle | null): CommandKpis {
  if (kpis.estimatedMonthlyLeakage >= 5000) return kpis;

  const baseline = bundle ? deriveBaselineMonthlyLeakage(bundle) : 0;
  if (baseline >= 5000) {
    const recoverableMonthly = Math.round(baseline * 0.72);
    return {
      moneyAtRisk: baseline,
      estimatedMonthlyLeakage: baseline,
      estimatedAnnualLeakage: baseline * 12,
      supplierInflationExposure: Math.max(kpis.supplierInflationExposure, Math.round(baseline * 2.4)),
      productsBelowGp: Math.max(kpis.productsBelowGp, Math.round(baseline * 0.38)),
      duplicateInvoiceRisks: Math.max(kpis.duplicateInvoiceRisks, Math.round(baseline * 0.08)),
      wastageLosses: Math.max(kpis.wastageLosses, Math.round(baseline * 0.12)),
      procurementAnomalies: Math.max(kpis.procurementAnomalies, Math.round(baseline * 0.1)),
      recoverableMonthly,
      recoverableAnnual: recoverableMonthly * 12,
      recoveryRatePercent: 72,
      pendingActions: Math.max(kpis.pendingActions, 6),
    };
  }

  return {
    ...HANDCRAFTED_DEMO_FALLBACK_KPIS,
    pendingActions: Math.max(kpis.pendingActions, HANDCRAFTED_DEMO_FALLBACK_KPIS.pendingActions),
  };
}

export function buildCommandKpis(
  productIntel: ProductIntelligenceRow[],
  bundle: HandcraftedDataBundle
): CommandKpis {
  const belowGp = productIntel.filter((p) => Number(p.gp_gap || 0) > 0);
  const productsBelowGpValue = belowGp.reduce((s, p) => s + Number(p.monthly_risk_value || 0), 0);
  let supplierInflation = Math.round(computeInflationExposure(bundle.ingredients));
  if (supplierInflation <= 0 && bundle.ingredients.length > 0) {
    const ingredientSpend = bundle.ingredients.reduce((s, i) => s + Number(i.purchase_cost || 0), 0);
    supplierInflation = Math.round(ingredientSpend * 0.08);
  }
  let wastage = Math.round(computeWastageExposure(bundle.costLines) * 4);
  if (wastage <= 0 && bundle.costLines.length > 0) {
    const lineTotal = bundle.costLines.reduce(
      (s, l) => s + Number(l.line_cost || l.line_cost_imported || 0),
      0
    );
    wastage = Math.round(lineTotal * 0.03);
  }
  let procurement = Math.round(computePackagingExposure(bundle.costLines) * 0.08);
  if (procurement <= 0) {
    procurement = Math.round(
      bundle.costLines.reduce((s, l) => s + Number(l.line_cost || l.line_cost_imported || 0), 0) * 0.02
    );
  }
  const duplicateRisk = Math.max(Math.round(supplierInflation * 0.12), 4200);
  const monthly =
    productsBelowGpValue + supplierInflation * 0.15 + wastage + procurement + duplicateRisk;
  const recoverableMonthly = Math.round(Math.max(monthly, 1) * 0.72);

  return ensureDemoKpis(
    {
      moneyAtRisk: Math.round(monthly),
      estimatedMonthlyLeakage: Math.round(monthly),
      estimatedAnnualLeakage: Math.round(monthly * 12),
      supplierInflationExposure: supplierInflation,
      productsBelowGp: Math.round(productsBelowGpValue),
      duplicateInvoiceRisks: duplicateRisk,
      wastageLosses: wastage,
      procurementAnomalies: procurement,
      recoverableMonthly,
      recoverableAnnual: recoverableMonthly * 12,
      recoveryRatePercent: 72,
      pendingActions: Math.min(12, Math.max(belowGp.length + 4, 6)),
    },
    bundle
  );
}

export function buildSupplierInflationRows(
  ingredients: Ingredient[],
  suppliers: Supplier[]
): SupplierInflationRow[] {
  const rows: SupplierInflationRow[] = [];

  for (const supplier of suppliers) {
    const movement = Number(supplier.last_price_movement || 0);
    const categoryIngredients = ingredients.filter(
      (i) => i.category === supplier.category || supplier.category === "Handcrafted Supplier"
    );
    const currentCost = categoryIngredients.reduce((s, i) => s + Number(i.purchase_cost || 0), 0);
    const previousCost = categoryIngredients.reduce((s, i) => s + Number(i.previous_cost || i.purchase_cost || 0), 0);
    const effectiveMovement =
      movement > 0 ? movement : calculateMovementPercent(previousCost / Math.max(categoryIngredients.length, 1), currentCost / Math.max(categoryIngredients.length, 1));
    const monthlyImpact = Math.round(Math.max(0, currentCost - previousCost) * 120);
    const annualImpact = monthlyImpact * 12;
    const riskScore = Math.min(99, Math.round(40 + effectiveMovement * 2));

    if (effectiveMovement <= 0 && monthlyImpact <= 0) continue;

    rows.push({
      id: `si-${supplier.id}`,
      supplier_name: supplier.supplier_name,
      category: supplier.category,
      current_cost: currentCost,
      previous_cost: previousCost,
      price_movement_percent: Number(effectiveMovement.toFixed(1)),
      monthly_impact: monthlyImpact,
      annual_impact: annualImpact,
      risk_level: riskScore >= 75 ? "Critical" : riskScore >= 55 ? "High" : "Medium",
      risk_score: riskScore,
      recommended_action: riskScore >= 75 ? "Negotiate" : "Monitor",
    });
  }

  if (rows.length < 8) {
    const inflated = ingredients
      .map((ing) => {
        const prev = Number(ing.previous_cost || ing.purchase_cost);
        const cur = Number(ing.purchase_cost);
        const move = calculateMovementPercent(prev, cur);
        return { ing, move, prev, cur };
      })
      .filter((x) => x.move > 2)
      .sort((a, b) => b.move - a.move)
      .slice(0, 12);

    for (const { ing, move, prev, cur } of inflated) {
      const monthly = Math.round((cur - prev) * 800);
      rows.push({
        id: `si-ing-${ing.id}`,
        supplier_name: `${ing.category} supply`,
        category: ing.category,
        current_cost: cur,
        previous_cost: prev,
        price_movement_percent: Number(move.toFixed(1)),
        monthly_impact: monthly,
        annual_impact: monthly * 12,
        risk_level: move > 10 ? "Critical" : move > 5 ? "High" : "Medium",
        risk_score: Math.min(99, Math.round(40 + move * 2)),
        recommended_action: move > 8 ? "Negotiate" : "Monitor",
      });
    }
  }

  return rows.sort((a, b) => b.annual_impact - a.annual_impact);
}

export function buildRecoveryOpportunities(
  productIntel: ProductIntelligenceRow[],
  bundle: HandcraftedDataBundle,
  kpis: CommandKpis
): RecoveryOpportunity[] {
  const repricingMonthly = productIntel
    .filter((p) => Number(p.gp_gap || 0) > 0)
    .reduce((s, p) => s + Number(p.monthly_risk_value || 0) * 0.85, 0);

  const packagingLines = bundle.costLines.filter((l) => /pack/i.test(String(l.line_type)));
  const packagingMonthly = Math.round(
    packagingLines.reduce((s, l) => s + Number(l.line_cost || 0), 0) * 0.06
  );

  const yieldMonthly = Math.round(kpis.wastageLosses * 0.35);
  const supplierMonthly = Math.round(kpis.supplierInflationExposure * 0.18);

  return [
    {
      id: "ro-reprice",
      opportunity: "Reprice below-target GP products",
      category: "Product GP",
      monthly_saving: Math.round(repricingMonthly) || 5446,
      annual_saving: Math.round(repricingMonthly * 12) || 65352,
      difficulty: "Low",
      status: "Pending Approval",
      action: "Approve Price",
    },
    {
      id: "ro-supplier",
      opportunity: "Negotiate protein & packaging suppliers",
      category: "Supplier",
      monthly_saving: supplierMonthly || 22720,
      annual_saving: (supplierMonthly || 22720) * 12,
      difficulty: "Medium",
      status: "Open",
      action: "Negotiate",
    },
    {
      id: "ro-yield",
      opportunity: "Production yield improvements",
      category: "Yield",
      monthly_saving: yieldMonthly || 4200,
      annual_saving: (yieldMonthly || 4200) * 12,
      difficulty: "Medium",
      status: "Open",
      action: "Review Batches",
    },
    {
      id: "ro-packaging",
      opportunity: "Reduce packaging cost on top SKUs",
      category: "Packaging",
      monthly_saving: packagingMonthly || 3100,
      annual_saving: (packagingMonthly || 3100) * 12,
      difficulty: "Low",
      status: "Open",
      action: "Review BOM",
    },
  ];
}

export function buildActionCentre(productIntel: ProductIntelligenceRow[]): ActionGroups {
  const below = productIntel.filter((p) => Number(p.gp_gap || 0) > 0);
  const healthy = productIntel.filter((p) => Number(p.gp_gap || 0) === 0 && Number(p.actual_gp || 0) > 0);

  return {
    urgent: below.slice(0, 5).map((p, i) => ({
      id: `urgent-${i}`,
      title: `${p.product_name} below target GP`,
      detail: `${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}% target · ${Number(p.gp_gap || 0).toFixed(1)}% gap`,
      href: "/product-profitability",
    })),
    review: [
      {
        id: "rev-supplier",
        title: "Supplier inflation review",
        detail: "Review imported ingredient price movement",
        href: "/supplier-inflation",
      },
      {
        id: "rev-recovery",
        title: "Recovery opportunities",
        detail: "Approve repricing and supplier actions",
        href: "/recovery-opportunities",
      },
      ...below.slice(5, 8).map((p, i) => ({
        id: `rev-gp-${i}`,
        title: `Review ${p.product_name}`,
        detail: `Suggested price ${Number(p.suggested_price || 0).toFixed(2)}`,
        href: "/product-profitability",
      })),
    ],
    healthy: healthy.slice(0, 6).map((p, i) => ({
      id: `healthy-${i}`,
      title: `${p.product_name} on target`,
      detail: `${Number(p.actual_gp || 0).toFixed(1)}% GP · stable margin`,
      href: "/product-profitability",
    })),
  };
}

export function buildAiFeed(
  productIntel: ProductIntelligenceRow[],
  kpis: CommandKpis,
  recovery: RecoveryOpportunity[]
): AiFeedItem[] {
  const topRisk = productIntel.find((p) => Number(p.gp_gap || 0) > 0);
  const topRecovery = recovery[0];

  return [
    {
      id: "ai-leakage",
      headline: "Monthly leakage exposure detected",
      detail: `${kpis.estimatedMonthlyLeakage.toLocaleString("en-ZA")} estimated monthly loss across GP, supplier and wastage drivers.`,
      lossAmount: kpis.estimatedMonthlyLeakage,
      recoverableAmount: kpis.recoverableMonthly,
      severity: "Critical",
      action: "Financial Leakage",
      href: "/financial-leakage",
      time: "Live",
    },
    topRisk && {
      id: "ai-gp",
      headline: `${topRisk.product_name} below target GP`,
      detail: `GP ${Number(topRisk.actual_gp || 0).toFixed(1)}% vs ${Number(topRisk.target_gp || 0)}% target.`,
      lossAmount: Number(topRisk.monthly_risk_value || 0),
      recoverableAmount: Math.round(Number(topRisk.monthly_risk_value || 0) * 0.85),
      severity: String(topRisk.risk_level || "High"),
      action: "Product Profitability",
      href: "/product-profitability",
      time: "Live",
    },
    {
      id: "ai-supplier",
      headline: "Supplier inflation on imported materials",
      detail: "Protein, packaging and spice lines show cost pressure.",
      lossAmount: kpis.supplierInflationExposure,
      recoverableAmount: Math.round(kpis.supplierInflationExposure * 0.8),
      severity: "High",
      action: "Supplier Inflation",
      href: "/supplier-inflation",
      time: "Live",
    },
    topRecovery && {
      id: "ai-recovery",
      headline: "Recoverable value identified",
      detail: topRecovery.opportunity,
      lossAmount: 0,
      recoverableAmount: topRecovery.annual_saving,
      severity: "High",
      action: "Recovery",
      href: "/recovery-opportunities",
      time: "Live",
    },
  ].filter(Boolean) as AiFeedItem[];
}

export function buildLeakageFindings(productIntel: ProductIntelligenceRow[], kpis: CommandKpis): LeakageFinding[] {
  const findings: LeakageFinding[] = belowGpFindings(productIntel);

  if (kpis.duplicateInvoiceRisks > 0) {
    findings.push({
      id: "lf-dup",
      finding_type: "Duplicate Invoice",
      title: "Duplicate invoice risk on supply chain",
      description: "Finance review recommended on matching supplier invoices.",
      estimated_monthly_loss: kpis.duplicateInvoiceRisks,
      severity: "Critical",
      status: "Investigate",
      branch_name: null,
      category_name: null,
      supplier_name: "Supply chain",
    });
  }

  if (kpis.supplierInflationExposure > 0) {
    findings.push({
      id: "lf-inf",
      finding_type: "Supplier Inflation",
      title: "Imported ingredient inflation exposure",
      description: "Costing data shows protein and packaging movement.",
      estimated_monthly_loss: Math.round(kpis.supplierInflationExposure / 12),
      severity: "High",
      status: "Open",
      branch_name: null,
      category_name: "Materials",
      supplier_name: null,
    });
  }

  if (kpis.wastageLosses > 0) {
    findings.push({
      id: "lf-waste",
      finding_type: "Wastage Loss",
      title: "Production wastage exposure",
      description: "BOM wastage flags on production cost lines.",
      estimated_monthly_loss: kpis.wastageLosses,
      severity: "Medium",
      status: "Open",
      branch_name: "Production",
      category_name: null,
      supplier_name: null,
    });
  }

  if (kpis.procurementAnomalies > 0) {
    findings.push({
      id: "lf-proc",
      finding_type: "Procurement Anomaly",
      title: "Packaging spend concentration",
      description: "Packaging lines exceed benchmark on key SKUs.",
      estimated_monthly_loss: kpis.procurementAnomalies,
      severity: "High",
      status: "Review",
      branch_name: null,
      category_name: "Packaging",
      supplier_name: null,
    });
  }

  return findings;
}

function belowGpFindings(productIntel: ProductIntelligenceRow[]): LeakageFinding[] {
  return productIntel
    .filter((p) => Number(p.gp_gap || 0) > 0)
    .slice(0, 8)
    .map((p, i) => ({
      id: `lf-gp-${i}`,
      finding_type: "Margin Erosion",
      title: `${p.product_name} below target GP`,
      description: `Actual ${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}% target.`,
      estimated_monthly_loss: Number(p.monthly_risk_value || 0),
      severity: String(p.risk_level || "High"),
      status: "Open",
      branch_name: null,
      category_name: String(p.category || null),
      supplier_name: null,
    }));
}

export function buildProductionIntelSections(productIntel: ProductIntelligenceRow[]): ProductionIntelSection[] {
  const withGp = productIntel.filter((p) => Number(p.selling_price || 0) > 0);
  const top = [...withGp].sort((a, b) => Number(b.actual_gp || 0) - Number(a.actual_gp || 0)).slice(0, 4);
  const low = [...withGp].sort((a, b) => Number(a.actual_gp || 0) - Number(b.actual_gp || 0)).slice(0, 4);

  return [
    {
      id: "top-gp",
      title: "Highest GP Products",
      items: top.map((p) => ({
        label: String(p.product_name),
        value: `${Number(p.actual_gp || 0).toFixed(1)}% GP`,
        tone: "emerald" as const,
      })),
    },
    {
      id: "low-gp",
      title: "Lowest GP Products",
      items: low.map((p) => ({
        label: String(p.product_name),
        value: `${Number(p.actual_gp || 0).toFixed(1)}% · gap ${Number(p.gp_gap || 0).toFixed(1)}%`,
        tone: "red" as const,
      })),
    },
  ];
}

export async function buildHandcraftedIntelligence() {
  const bundle = await loadHandcraftedBundle();
  if (!bundle) return null;

  const productIntel = buildProductIntelligenceRows(bundle.products);
  const kpis = buildCommandKpis(productIntel, bundle);
  const recovery = buildRecoveryOpportunities(productIntel, bundle, kpis);
  const recoverableAnnual = recovery.reduce((s, r) => s + r.annual_saving, 0);

  return {
    bundle,
    productIntel,
    kpis,
    recovery,
    supplierInflation: buildSupplierInflationRows(bundle.ingredients, bundle.suppliers),
    actionCentre: buildActionCentre(productIntel),
    aiFeed: buildAiFeed(productIntel, kpis, recovery),
    leakageFindings: buildLeakageFindings(productIntel, kpis),
    productionIntel: buildProductionIntelSections(productIntel),
    roi: {
      platformCostAnnual: PLATFORM_COST_ANNUAL,
      recoverableAnnual: Math.max(kpis.recoverableAnnual, recoverableAnnual),
      roiMultiple: Number(
        (Math.max(kpis.recoverableAnnual, recoverableAnnual) / PLATFORM_COST_ANNUAL).toFixed(1)
      ),
    },
  };
}
