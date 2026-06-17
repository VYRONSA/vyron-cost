import { supabase } from "@/lib/supabase";
import {
  buildHandcraftedIntelligence,
  HANDCRAFTED_COMPANY_ID,
} from "@/lib/vyron-handcrafted-intelligence";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type LeakageFinding = {
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
  created_at?: string;
};

export type InvoiceRiskFinding = {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  invoice_amount: number | null;
  risk_type: string | null;
  risk_score: number | null;
  ai_confidence: number | null;
  duplicate_of: string | null;
  review_status: string | null;
  detected_at?: string;
};

export type ProcurementRiskFinding = {
  id: string;
  supplier_name: string | null;
  category_name: string | null;
  risk_type: string | null;
  risk_score: number | null;
  price_change_percent: number | null;
  spend_amount: number | null;
  action_required: string | null;
  detected_at?: string;
};

export type BranchRiskFinding = {
  id: string;
  branch_name: string | null;
  spend_total: number | null;
  wastage_estimate: number | null;
  invoice_volume: number | null;
  gp_erosion_percent: number | null;
  procurement_efficiency: number | null;
  leakage_score: number | null;
  risk_level: string | null;
};

export type FinancialLeakageDashboard = {
  estimatedMonthlyLeakage: number;
  duplicateInvoiceRisk: number;
  supplierInflationExposure: number;
  branchOverspending: number;
  wastageLossEstimate: number;
  procurementAnomalies: number;
  categoryMarginErosion: number;
  highRiskSuppliers: number;
  activeInvestigations: number;
};

export const demoLeakageFindings: LeakageFinding[] = [
  { id: "lf-1", finding_type: "Duplicate Invoice", title: "INV-8841 duplicate payment risk", description: "Same supplier and amount posted twice", estimated_monthly_loss: 18420, severity: "Critical", status: "Investigate", branch_name: null, category_name: null, supplier_name: "Premium Meat Suppliers" },
  { id: "lf-2", finding_type: "Supplier Inflation", title: "Chicken meat inflation spike", description: "Unit price up 14.8% in 30 days", estimated_monthly_loss: 24680, severity: "High", status: "Open", branch_name: null, category_name: "Protein", supplier_name: "Premium Meat Suppliers" },
  { id: "lf-3", finding_type: "Branch Overspend", title: "Parow Factory branch spend anomaly", description: "Spend 22% above branch benchmark", estimated_monthly_loss: 32100, severity: "High", status: "Open", branch_name: "Parow Factory", category_name: null, supplier_name: null },
  { id: "lf-4", finding_type: "Wastage Loss", title: "Pie filling wastage trend breach", description: "Wastage above target for 3 weeks", estimated_monthly_loss: 12840, severity: "Medium", status: "Open", branch_name: "Cape Town Distribution", category_name: null, supplier_name: null },
  { id: "lf-5", finding_type: "Procurement Anomaly", title: "Unauthorized category purchase", description: "Non-approved supplier used for packaging", estimated_monthly_loss: 9650, severity: "High", status: "Investigate", branch_name: null, category_name: "Packaging", supplier_name: "PackRight Packaging" },
  { id: "lf-6", finding_type: "Margin Erosion", title: "Chicken & Mushroom Pie GP collapse", description: "Selling price unchanged, cost up 9.2%", estimated_monthly_loss: 14220, severity: "Medium", status: "Open", branch_name: null, category_name: "Handcrafted Pies", supplier_name: null },
  { id: "lf-7", finding_type: "Invoice Splitting", title: "Split invoice pattern detected", description: "Multiple invoices just below approval limit", estimated_monthly_loss: 11200, severity: "Critical", status: "Investigate", branch_name: null, category_name: null, supplier_name: "Cape Flour Mills" },
  { id: "lf-8", finding_type: "Stock Leakage", title: "Inventory shrinkage variance", description: "Theoretical vs actual stock gap widening", estimated_monthly_loss: 18750, severity: "High", status: "Open", branch_name: "Somerset West Distribution", category_name: null, supplier_name: null },
];

export const demoInvoiceRiskFindings: InvoiceRiskFinding[] = [
  { id: "ir-1", invoice_number: "INV-8841", supplier_name: "Premium Meat Suppliers", invoice_amount: 24850, risk_type: "Duplicate Invoice", risk_score: 92.4, ai_confidence: 94, duplicate_of: "INV-8720", review_status: "Pending Review" },
  { id: "ir-2", invoice_number: "INV-8720", supplier_name: "Premium Meat Suppliers", invoice_amount: 24850, risk_type: "Duplicate Match", risk_score: 91.8, ai_confidence: 93.5, duplicate_of: "INV-8841", review_status: "Pending Review" },
  { id: "ir-3", invoice_number: "PF-22018", supplier_name: "Cape Packaging Solutions", invoice_amount: 9840, risk_type: "Same Amount Pattern", risk_score: 78.2, ai_confidence: 88, duplicate_of: null, review_status: "Pending Review" },
  { id: "ir-4", invoice_number: "MF-9912", supplier_name: "Cape Flour Mills", invoice_amount: 4999, risk_type: "Invoice Splitting", risk_score: 85.6, ai_confidence: 90.2, duplicate_of: null, review_status: "Investigate" },
  { id: "ir-5", invoice_number: "MF-9913", supplier_name: "Cape Flour Mills", invoice_amount: 4995, risk_type: "Invoice Splitting", risk_score: 84.9, ai_confidence: 89.8, duplicate_of: null, review_status: "Investigate" },
  { id: "ir-6", invoice_number: "DF-4410", supplier_name: "Peninsula Produce", invoice_amount: 184200, risk_type: "Unusual Value", risk_score: 72.4, ai_confidence: 86.5, duplicate_of: null, review_status: "Pending Review" },
  { id: "ir-7", invoice_number: "PD-11882", supplier_name: "Premium Meat Suppliers", invoice_amount: 12400, risk_type: "High Frequency", risk_score: 68.5, ai_confidence: 82, duplicate_of: null, review_status: "Monitor" },
  { id: "ir-8", invoice_number: "PW-3301", supplier_name: "Cape Packaging Solutions", invoice_amount: 9840, risk_type: "Duplicate Number", risk_score: 88.1, ai_confidence: 91.4, duplicate_of: "PW-3298", review_status: "Pending Review" },
];

export const demoProcurementRiskFindings: ProcurementRiskFinding[] = [
  { id: "pr-1", supplier_name: "Premium Meat Suppliers", category_name: "Protein", risk_type: "Supplier Inflation", risk_score: 86.4, price_change_percent: 14.8, spend_amount: 184520, action_required: "Approve Price Increase" },
  { id: "pr-2", supplier_name: "PackRight Packaging", category_name: "Packaging", risk_type: "Unauthorized Purchase", risk_score: 79.2, price_change_percent: 0, spend_amount: 42800, action_required: "Block Supplier" },
  { id: "pr-3", supplier_name: "Cape Flour Mills", category_name: "Dry Goods", risk_type: "Invoice Splitting", risk_score: 84.1, price_change_percent: 0, spend_amount: 62400, action_required: "Investigate" },
  { id: "pr-4", supplier_name: "Cape Packaging Solutions", category_name: "Packaging", risk_type: "Unmatched Lines", risk_score: 62.5, price_change_percent: 5.4, spend_amount: 62400, action_required: "Map Invoice Lines" },
  { id: "pr-5", supplier_name: "Peninsula Produce", category_name: "Fresh Produce", risk_type: "Concentration Risk", risk_score: 71, price_change_percent: 8.2, spend_amount: 142800, action_required: "Diversify Suppliers" },
  { id: "pr-6", supplier_name: "Premium Meat Suppliers", category_name: "Protein", risk_type: "Collusion Indicator", risk_score: 58.4, price_change_percent: 12.1, spend_amount: 184520, action_required: "Audit Buying" },
  { id: "pr-7", supplier_name: "Cape Dairy Supplies", category_name: "Dairy", risk_type: "Category Overspend", risk_score: 74.8, price_change_percent: 11.6, spend_amount: 98400, action_required: "Review Budget" },
  { id: "pr-8", supplier_name: "Peninsula Produce", category_name: "Fresh Produce", risk_type: "Unusual Buying", risk_score: 44.2, price_change_percent: 3.2, spend_amount: 98500, action_required: "Monitor" },
];

export const demoBranchRiskFindings: BranchRiskFinding[] = [
  { id: "br-1", branch_name: "Parow Factory", spend_total: 842000, wastage_estimate: 42800, invoice_volume: 186, gp_erosion_percent: 4.8, procurement_efficiency: 72, leakage_score: 78.4, risk_level: "Critical" },
  { id: "br-2", branch_name: "Cape Town Distribution", spend_total: 624500, wastage_estimate: 28400, invoice_volume: 142, gp_erosion_percent: 3.2, procurement_efficiency: 81, leakage_score: 54.2, risk_level: "High" },
  { id: "br-3", branch_name: "Somerset West Distribution", spend_total: 512800, wastage_estimate: 31200, invoice_volume: 128, gp_erosion_percent: 5.6, procurement_efficiency: 68, leakage_score: 62.8, risk_level: "High" },
  { id: "br-4", branch_name: "Northern Suburbs Distribution", spend_total: 398200, wastage_estimate: 18600, invoice_volume: 98, gp_erosion_percent: 2.1, procurement_efficiency: 88, leakage_score: 28.4, risk_level: "Medium" },
  { id: "br-5", branch_name: "Cape Town Distribution", spend_total: 445600, wastage_estimate: 22100, invoice_volume: 112, gp_erosion_percent: 3.8, procurement_efficiency: 79, leakage_score: 41.6, risk_level: "Medium" },
  { id: "br-6", branch_name: "Somerset West Distribution", spend_total: 286400, wastage_estimate: 14200, invoice_volume: 76, gp_erosion_percent: 1.9, procurement_efficiency: 91, leakage_score: 22.1, risk_level: "Low" },
];

function buildDashboard(findings: LeakageFinding[]): FinancialLeakageDashboard {
  const sum = (type: string) =>
    findings
      .filter((row) => String(row.finding_type || "").toLowerCase().includes(type.toLowerCase()))
      .reduce((total, row) => total + Number(row.estimated_monthly_loss || 0), 0);

  const totalLeakage = findings.reduce((total, row) => total + Number(row.estimated_monthly_loss || 0), 0);

  return {
    estimatedMonthlyLeakage: totalLeakage,
    duplicateInvoiceRisk: sum("duplicate"),
    supplierInflationExposure: sum("inflation"),
    branchOverspending: sum("branch"),
    wastageLossEstimate: sum("wastage"),
    procurementAnomalies: sum("procurement"),
    categoryMarginErosion: sum("margin"),
    highRiskSuppliers: findings.filter((row) => row.supplier_name && ["Critical", "High"].includes(String(row.severity))).length,
    activeInvestigations: findings.filter((row) => String(row.status || "").toLowerCase().includes("investigate")).length,
  };
}

export const demoFinancialLeakageDashboard = buildDashboard(demoLeakageFindings);

async function buildHandcraftedInvoiceFindings(): Promise<InvoiceRiskFinding[]> {
  const intel = await buildHandcraftedIntelligence();
  const kpis = intel?.kpis;
  if (!kpis) return [];
  return [
    {
      id: "hfp-ir-1",
      invoice_number: "HFP-8841",
      supplier_name: "Primary protein supplier",
      invoice_amount: kpis.duplicateInvoiceRisks || 24850,
      risk_type: "Duplicate Invoice",
      risk_score: 92,
      ai_confidence: 94,
      duplicate_of: "HFP-8720",
      review_status: "Pending Review",
    },
  ];
}

async function buildHandcraftedProcurementFindings(): Promise<ProcurementRiskFinding[]> {
  const intel = await buildHandcraftedIntelligence();
  const ingredients = intel?.bundle.ingredients ?? [];
  const byCat = new Map<string, { movement: number; cost: number }>();
  for (const ing of ingredients) {
    const cat = ing.category || "General";
    const prev = Number(ing.previous_cost || ing.purchase_cost);
    const move = prev > 0 ? ((ing.purchase_cost - prev) / prev) * 100 : 0;
    const cur = byCat.get(cat) || { movement: 0, cost: 0 };
    cur.movement = Math.max(cur.movement, move);
    cur.cost += ing.purchase_cost;
    byCat.set(cat, cur);
  }
  return [...byCat.entries()].slice(0, 6).map(([category, data], i) => ({
    id: `hfp-pr-${i}`,
    supplier_name: `${category} supplier`,
    category_name: category,
    risk_type: data.movement > 8 ? "Supplier Inflation" : "Monitor",
    risk_score: Math.min(95, 50 + data.movement * 2),
    price_change_percent: Number(data.movement.toFixed(1)),
    spend_amount: Math.round(data.cost * 100),
    action_required: data.movement > 8 ? "Negotiate" : "Monitor",
  }));
}

async function buildHandcraftedBranchFindings(): Promise<BranchRiskFinding[]> {
  const intel = await buildHandcraftedIntelligence();
  const wastage = intel?.kpis.wastageLosses ?? 0;
  return [
    {
      id: "hfp-br-prod",
      branch_name: "Production — Handcrafted",
      spend_total: 420000,
      wastage_estimate: wastage,
      invoice_volume: 84,
      gp_erosion_percent: 3.2,
      procurement_efficiency: 78,
      leakage_score: 52,
      risk_level: "Medium",
    },
    {
      id: "hfp-br-wh",
      branch_name: "Warehouse — Cape Town",
      spend_total: 286000,
      wastage_estimate: 14200,
      invoice_volume: 56,
      gp_erosion_percent: 2.1,
      procurement_efficiency: 88,
      leakage_score: 28,
      risk_level: "Low",
    },
  ];
}

async function fetchTable<T>(
  table: string,
  orderColumn: string,
  companyId?: string
): Promise<T[] | null> {
  if (!supabase) return null;
  let query = supabase.from(table).select("*").order(orderColumn, { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.limit(500);
  if (error || !data || data.length === 0) return null;
  return data as T[];
}

export async function getLeakageFindings() {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];

  if (useDemo) {
    const seeded = await fetchTable<LeakageFinding>(
      "vyron_cost_leakage_findings",
      "estimated_monthly_loss",
      HANDCRAFTED_COMPANY_ID
    );
    if (seeded?.length) return seeded;

    const intel = await buildHandcraftedIntelligence();
    if (intel?.leakageFindings.length) return intel.leakageFindings;
  }

  const data = await fetchTable<LeakageFinding>("vyron_cost_leakage_findings", "estimated_monthly_loss", companyId ?? undefined);
  if (data?.length) return data;
  return useDemo ? demoLeakageFindings : [];
}

export async function getInvoiceRiskFindings() {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];

  if (useDemo) {
    const seeded = await fetchTable<InvoiceRiskFinding>(
      "vyron_cost_invoice_risk_findings",
      "risk_score",
      HANDCRAFTED_COMPANY_ID
    );
    if (seeded?.length) return seeded;

    const handcrafted = await buildHandcraftedInvoiceFindings();
    if (handcrafted.length) return handcrafted;
  }

  const data = await fetchTable<InvoiceRiskFinding>("vyron_cost_invoice_risk_findings", "risk_score", companyId ?? undefined);
  return data?.length ? data : useDemo ? demoInvoiceRiskFindings : [];
}

export async function getProcurementRiskFindings() {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];

  if (useDemo) {
    const seeded = await fetchTable<ProcurementRiskFinding>(
      "vyron_cost_procurement_risk_findings",
      "risk_score",
      HANDCRAFTED_COMPANY_ID
    );
    if (seeded?.length) return seeded;

    const handcrafted = await buildHandcraftedProcurementFindings();
    if (handcrafted.length) return handcrafted;
  }

  const data = await fetchTable<ProcurementRiskFinding>("vyron_cost_procurement_risk_findings", "risk_score", companyId ?? undefined);
  return data?.length ? data : useDemo ? demoProcurementRiskFindings : [];
}

export async function getBranchRiskFindings() {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];

  if (useDemo) {
    const seeded = await fetchTable<BranchRiskFinding>(
      "vyron_cost_branch_risk_findings",
      "leakage_score",
      HANDCRAFTED_COMPANY_ID
    );
    if (seeded?.length) return seeded;

    const handcrafted = await buildHandcraftedBranchFindings();
    if (handcrafted.length) return handcrafted;
  }

  const data = await fetchTable<BranchRiskFinding>("vyron_cost_branch_risk_findings", "leakage_score", companyId ?? undefined);
  return data?.length ? data : useDemo ? demoBranchRiskFindings : [];
}

export async function getFinancialLeakageDashboard() {
  const findings = await getLeakageFindings();
  return buildDashboard(findings);
}
