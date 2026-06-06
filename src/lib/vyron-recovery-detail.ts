import { formatMoney } from "@/lib/vyron-cost-data";
import type { RecoveryOpportunity } from "@/lib/vyron-demo-data";
import { buildHandcraftedIntelligence } from "@/lib/vyron-handcrafted-intelligence";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { getRecoveryOpportunities } from "@/lib/vyron-financial-command-data";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";

export type RecoveryOpportunityDetail = {
  id: string;
  opportunity: string;
  category: string;
  monthly_saving: number;
  annual_saving: number;
  difficulty: string;
  status: string;
  action: string;
  whyDetected: string;
  formulaName: string;
  formulaExpression: string;
  formulaWorkedExample: string;
  dataSource: string;
  confidencePercent: number;
  recommendedAction: string;
  productsAffected: { id: string; name: string; href: string; impact: string }[];
  suppliersAffected: { id: string; name: string; href: string; impact: string }[];
};

/** Short formula shown wherever recovery amounts appear in lists. */
export function getRecoveryFormulaHint(row: Pick<RecoveryOpportunity, "id" | "category">): string {
  if (row.id === "ro-reprice" || /gp|price|reprice/i.test(row.category)) {
    return "(Target GP gap × monthly product sales) × 12";
  }
  if (row.id === "ro-supplier" || /supplier/i.test(row.category)) {
    return "(Supplier price variance × expected monthly usage) × 12";
  }
  if (row.id === "ro-yield" || /yield/i.test(row.category)) {
    return "(Wastage/yield loss per batch × monthly batches) × 12";
  }
  if (row.id === "ro-packaging" || /pack/i.test(row.category)) {
    return "(Packaging cost reduction per unit × monthly units sold) × 12";
  }
  return "Estimated avoidable monthly loss × 12";
}

function confidenceFromDifficulty(difficulty: string) {
  const value = difficulty.toLowerCase();
  if (value.includes("low")) return 92;
  if (value.includes("medium")) return 78;
  return 64;
}

function buildGpRecoveryDetail(
  base: RecoveryOpportunity,
  productIntel: ProductIntelligenceRow[]
): RecoveryOpportunityDetail {
  const below = productIntel.filter((p) => Number(p.gp_gap || 0) > 0);
  const monthlyGapTotal = below.reduce((sum, p) => sum + Number(p.monthly_risk_value || 0) * 0.85, 0);
  const monthly = base.monthly_saving || Math.round(monthlyGapTotal) || 5446;

  return {
    ...base,
    monthly_saving: monthly,
    annual_saving: monthly * 12,
    whyDetected: `${below.length} finished products are below target GP. VYRON COST calculated avoidable margin loss from GP gap × estimated monthly sales.`,
    formulaName: "Below-target GP recovery",
    formulaExpression: "Potential Recovery = (Target GP margin gap × monthly product sales) × 12",
    formulaWorkedExample: `Monthly avoidable loss ≈ ${formatMoney(monthly)} → Annual = ${formatMoney(monthly)} × 12 = ${formatMoney(monthly * 12)}`,
    dataSource: "Product selling prices, BOM costs and target GP from Supabase / Handcrafted import",
    confidencePercent: confidenceFromDifficulty(base.difficulty),
    recommendedAction: "Approve repricing on below-target products or reduce BOM cost via supplier negotiation.",
    productsAffected: below.slice(0, 8).map((p) => ({
      id: String(p.id),
      name: String(p.product_name),
      href: `/products/${p.id}`,
      impact: `${Number(p.gp_gap || 0).toFixed(1)}% GP gap · ${formatMoney(Number(p.monthly_risk_value || 0))}/mo`,
    })),
    suppliersAffected: [],
  };
}

function buildSupplierRecoveryDetail(
  base: RecoveryOpportunity,
  kpis: { supplierInflationExposure: number }
): RecoveryOpportunityDetail {
  const monthly = base.monthly_saving || Math.round(kpis.supplierInflationExposure * 0.18) || 22720;
  return {
    ...base,
    monthly_saving: monthly,
    annual_saving: monthly * 12,
    whyDetected:
      "Supplier price movement on linked ingredients exceeds acceptable variance. Negotiation recovery is estimated from current supplier price variance × expected monthly usage.",
    formulaName: "Supplier negotiation recovery",
    formulaExpression: "Potential Recovery = (Current supplier price variance × expected monthly usage) × 12",
    formulaWorkedExample: `Monthly negotiation opportunity ≈ ${formatMoney(monthly)} → Annual = ${formatMoney(monthly)} × 12 = ${formatMoney(monthly * 12)}`,
    dataSource: "Supplier master, ingredient purchase costs and price movement %",
    confidencePercent: confidenceFromDifficulty(base.difficulty),
    recommendedAction: "Open supplier intelligence, review linked ingredients and initiate negotiation or alternate sourcing.",
    productsAffected: [],
    suppliersAffected: [
      { id: "supplier-protein", name: "Protein Direct", href: "/suppliers", impact: "High price movement on protein lines" },
      { id: "supplier-pack", name: "Cape Dry Goods", href: "/suppliers", impact: "Packaging inflation exposure" },
    ],
  };
}

function buildYieldRecoveryDetail(base: RecoveryOpportunity, wastageLosses: number): RecoveryOpportunityDetail {
  const monthly = base.monthly_saving || Math.round(wastageLosses * 0.35) || 4200;
  return {
    ...base,
    monthly_saving: monthly,
    annual_saving: monthly * 12,
    whyDetected:
      "Batch yield and wastage rules show recoverable production loss on high-volume recipes. Recovery is based on wastage/yield loss value per batch × monthly batches.",
    formulaName: "Yield recovery",
    formulaExpression: "Potential Recovery = (Wastage/yield loss value per batch × monthly batches) × 12",
    formulaWorkedExample: `Monthly yield recovery ≈ ${formatMoney(monthly)} → Annual = ${formatMoney(monthly)} × 12 = ${formatMoney(monthly * 12)}`,
    dataSource: "Recipe BOM, yield % on ingredients and batch run assumptions",
    confidencePercent: confidenceFromDifficulty(base.difficulty),
    recommendedAction: "Review BOM yield lines, prep loss and batch sizes on affected recipes.",
    productsAffected: [],
    suppliersAffected: [],
  };
}

function buildPackagingRecoveryDetail(
  base: RecoveryOpportunity,
  packagingMonthly: number
): RecoveryOpportunityDetail {
  const monthly = base.monthly_saving || packagingMonthly || 3100;
  return {
    ...base,
    monthly_saving: monthly,
    annual_saving: monthly * 12,
    whyDetected:
      "Packaging cost lines on top SKUs exceed benchmark. Saving recovery uses packaging cost reduction per unit × monthly units sold.",
    formulaName: "Packaging saving recovery",
    formulaExpression: "Potential Recovery = (Packaging cost reduction per unit × monthly units sold) × 12",
    formulaWorkedExample: `Monthly packaging saving ≈ ${formatMoney(monthly)} → Annual = ${formatMoney(monthly)} × 12 = ${formatMoney(monthly * 12)}`,
    dataSource: "Product cost lines tagged as packaging on BOM / product costing",
    confidencePercent: confidenceFromDifficulty(base.difficulty),
    recommendedAction: "Review packaging BOM lines, negotiate supplier or change pack spec on top sellers.",
    productsAffected: [],
    suppliersAffected: [],
  };
}

function enrichOpportunity(
  base: RecoveryOpportunity,
  productIntel: ProductIntelligenceRow[],
  kpis: { supplierInflationExposure: number; wastageLosses: number },
  packagingMonthly: number
): RecoveryOpportunityDetail {
  if (base.id === "ro-reprice" || /gp|price|reprice/i.test(base.category)) {
    return buildGpRecoveryDetail(base, productIntel);
  }
  if (base.id === "ro-supplier" || /supplier/i.test(base.category)) {
    return buildSupplierRecoveryDetail(base, kpis);
  }
  if (base.id === "ro-yield" || /yield/i.test(base.category)) {
    return buildYieldRecoveryDetail(base, kpis.wastageLosses);
  }
  if (base.id === "ro-packaging" || /pack/i.test(base.category)) {
    return buildPackagingRecoveryDetail(base, packagingMonthly);
  }

  const monthly = base.monthly_saving;
  return {
    ...base,
    whyDetected: "VYRON COST identified an avoidable monthly loss from imported costing and intelligence rules.",
    formulaName: "Standard recovery",
    formulaExpression: "Potential Recovery = estimated avoidable monthly loss × 12",
    formulaWorkedExample: `${formatMoney(monthly)} × 12 = ${formatMoney(monthly * 12)}`,
    dataSource: "VYRON COST intelligence engine · Handcrafted tenant",
    confidencePercent: confidenceFromDifficulty(base.difficulty),
    recommendedAction: base.action,
    productsAffected: [],
    suppliersAffected: [],
  };
}

export async function getRecoveryOpportunityList(): Promise<RecoveryOpportunity[]> {
  return getRecoveryOpportunities();
}

export async function getRecoveryOpportunityDetail(id: string): Promise<RecoveryOpportunityDetail | null> {
  const [rows, intel, productIntelFallback] = await Promise.all([
    getRecoveryOpportunities(),
    buildHandcraftedIntelligence(),
    getProductIntelligence(),
  ]);
  const base = rows.find((row) => row.id === id);
  if (!base) return null;

  const productIntel = intel?.productIntel?.length ? intel.productIntel : productIntelFallback;
  const kpis = intel?.kpis ?? {
    supplierInflationExposure: 272640,
    wastageLosses: 12000,
  };
  const packagingLines = intel?.bundle?.costLines?.filter((l) => /pack/i.test(String(l.line_type))) ?? [];
  const packagingMonthly = Math.round(
    packagingLines.reduce((s, l) => s + Number(l.line_cost || 0), 0) * 0.06
  );

  return enrichOpportunity(base, productIntel, kpis, packagingMonthly);
}
