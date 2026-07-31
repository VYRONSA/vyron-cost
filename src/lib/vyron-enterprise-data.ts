import { supabase } from "@/lib/supabase";
import { getHandcraftedCompany, getHandcraftedProductIntelligence, isHandcraftedDataReady } from "@/lib/handcrafted-tenant";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type VyronCompany = {
  id: string;
  company_name: string;
  trading_name: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  currency_code: string | null;
  vat_percent: number | null;
  logo_url: string | null;
  primary_color: string | null;
};

export type VyronBranch = {
  id: string;
  company_id: string | null;
  branch_name: string;
  branch_code: string | null;
  city: string | null;
  region: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean | null;
};

export type VyronCostAlert = {
  id: string;
  company_id: string | null;
  branch_id: string | null;
  severity: string;
  alert_type: string | null;
  alert_title: string | null;
  alert_message: string | null;
  is_read: boolean | null;
  created_at?: string;
};

export type VyronInvoiceHeader = {
  id: string;
  company_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_total: number | null;
  vat_total: number | null;
  invoice_status: string | null;
  pdf_url: string | null;
  ai_processed: boolean | null;
};

export type VyronInvoiceLine = {
  id: string;
  invoice_id: string | null;
  ingredient_name: string | null;
  supplier_product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  mapped_ingredient_id: string | null;
  ai_confidence: number | null;
};

export type VyronPriceMovement = {
  id: string;
  ingredient_id: string | null;
  supplier_name: string | null;
  old_price: number | null;
  new_price: number | null;
  movement_percent: number | null;
  movement_type: string | null;
  detected_at?: string;
};

export type VyronActivityLog = {
  id: string;
  company_id: string | null;
  user_name: string | null;
  action_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at?: string;
};

export const demoCompany: VyronCompany = {
  id: "handcrafted-foods-demo",
  company_name: "Handcrafted Foods",
  trading_name: "Handcrafted Foods — Premium Pie Company",
  subscription_plan: "Professional",
  subscription_status: "Demo",
  currency_code: "ZAR",
  vat_percent: 15,
  logo_url: null,
  primary_color: "#8b5cf6",
};

export const demoBranches: VyronBranch[] = [
  {
    id: "hfp-branch-parow",
    company_id: "handcrafted-foods-demo",
    branch_name: "Parow Factory",
    branch_code: "PAROW-FAC",
    city: "Cape Town",
    region: "Western Cape",
    contact_email: "factory@handcraftedfoods.co.za",
    contact_phone: "021 000 0000",
    is_active: true,
  },
  {
    id: "hfp-branch-cpt-dist",
    company_id: "handcrafted-foods-demo",
    branch_name: "Cape Town Distribution",
    branch_code: "CPT-DIST",
    city: "Cape Town",
    region: "Western Cape",
    contact_email: "dispatch@handcraftedfoods.co.za",
    contact_phone: "021 000 0001",
    is_active: true,
  },
  {
    id: "hfp-branch-swest",
    company_id: "handcrafted-foods-demo",
    branch_name: "Somerset West Distribution",
    branch_code: "SW-DIST",
    city: "Somerset West",
    region: "Western Cape",
    contact_email: "somerset@handcraftedfoods.co.za",
    contact_phone: "021 000 0002",
    is_active: true,
  },
];

export const demoAlerts: VyronCostAlert[] = [
  {
    id: "hfp-alert-1",
    company_id: "handcrafted-foods-demo",
    branch_id: "hfp-branch-parow",
    severity: "Critical",
    alert_type: "GP Risk",
    alert_title: "Chicken & Mushroom Pie below target GP",
    alert_message: "Chicken, pastry margarine and packaging increases are pushing this product below target GP.",
    is_read: false,
  },
  {
    id: "hfp-alert-2",
    company_id: "handcrafted-foods-demo",
    branch_id: "hfp-branch-parow",
    severity: "High",
    alert_type: "Supplier Increase",
    alert_title: "Premium Meat Suppliers increase detected",
    alert_message: "Latest protein invoice indicates a material increase against the previous beef and steak unit cost.",
    is_read: false,
  },
  {
    id: "hfp-alert-3",
    company_id: "handcrafted-foods-demo",
    branch_id: "hfp-branch-cpt-dist",
    severity: "Medium",
    alert_type: "Packaging Warning",
    alert_title: "Pie foil tray cost moved above benchmark",
    alert_message: "Packaging movement is affecting single-serve pie margin.",
    is_read: true,
  },
];

export const demoInvoices: VyronInvoiceHeader[] = [
  {
    id: "hfp-invoice-1",
    company_id: "handcrafted-foods-demo",
    supplier_name: "Premium Meat Suppliers",
    invoice_number: "PMS-INV-1042",
    invoice_date: "2026-05-08",
    invoice_total: 18450.9,
    vat_total: 2406.64,
    invoice_status: "AI Review",
    pdf_url: null,
    ai_processed: true,
  },
  {
    id: "hfp-invoice-2",
    company_id: "handcrafted-foods-demo",
    supplier_name: "Cape Packaging Solutions",
    invoice_number: "CPS-8821",
    invoice_date: "2026-05-07",
    invoice_total: 6240.75,
    vat_total: 813.99,
    invoice_status: "Pending",
    pdf_url: null,
    ai_processed: false,
  },
];

export const demoInvoiceLines: VyronInvoiceLine[] = [
  {
    id: "hfp-invoice-line-1",
    invoice_id: "hfp-invoice-1",
    ingredient_name: "Beef Mince",
    supplier_product_name: "BEEF MINCE 10KG",
    quantity: 10,
    unit: "kg",
    unit_price: 94,
    line_total: 940,
    mapped_ingredient_id: null,
    ai_confidence: 94,
  },
  {
    id: "hfp-invoice-line-2",
    invoice_id: "hfp-invoice-1",
    ingredient_name: "Steak Pieces",
    supplier_product_name: "STEAK PIE PIECES",
    quantity: 12,
    unit: "kg",
    unit_price: 126.5,
    line_total: 1518,
    mapped_ingredient_id: null,
    ai_confidence: 89,
  },
  {
    id: "hfp-invoice-line-3",
    invoice_id: "hfp-invoice-2",
    ingredient_name: "Pie Foil Tray",
    supplier_product_name: "FOIL PIE TRAY 1000",
    quantity: 1000,
    unit: "unit",
    unit_price: 1.35,
    line_total: 1350,
    mapped_ingredient_id: null,
    ai_confidence: 92,
  },
];

export const demoPriceMovements: VyronPriceMovement[] = [
  {
    id: "hfp-movement-1",
    ingredient_id: null,
    supplier_name: "Premium Meat Suppliers",
    old_price: 82,
    new_price: 94,
    movement_percent: 14.63,
    movement_type: "Increase",
  },
  {
    id: "hfp-movement-2",
    ingredient_id: null,
    supplier_name: "Cape Packaging Solutions",
    old_price: 1.12,
    new_price: 1.35,
    movement_percent: 20.54,
    movement_type: "Increase",
  },
];

export const demoActivity: VyronActivityLog[] = [
  {
    id: "hfp-activity-1",
    company_id: "handcrafted-foods-demo",
    user_name: "VYRON AI",
    action_type: "Invoice analysed",
    entity_type: "Invoice",
    entity_id: "hfp-invoice-1",
    old_value: null,
    new_value: { status: "AI Review" },
  },
];

async function fetchRows<T>(table: string, fallback: T[], orderColumn = "created_at"): Promise<T[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? fallback : [];

  let query = supabase.from(table).select("*").order(orderColumn, { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error || !data || data.length === 0) return useDemo ? fallback : [];
  return data as T[];
}

function buildHandcraftedAlerts(): VyronCostAlert[] {
  return getHandcraftedProductIntelligence()
    .filter((p) => Number(p.gp_gap || 0) > 0)
    .slice(0, 5)
    .map((p, i) => ({
      id: `hfp-alert-${i}`,
      company_id: "handcrafted-foods-demo",
      branch_id: null,
      severity: String(p.risk_level || "High"),
      alert_type: "GP Risk",
      alert_title: `${p.product_name} below target`,
      alert_message: `GP ${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}%`,
      is_read: false,
    }));
}

export async function getEnterpriseCompanies() {
  if ((await workspaceScope()).useDemo) {
    const c = getHandcraftedCompany();
    return [{
      id: c.id,
      company_name: c.company_name,
      trading_name: c.trading_name,
      subscription_plan: c.subscription_plan,
      subscription_status: c.subscription_status,
      currency_code: c.currency_code,
      vat_percent: c.vat_percent,
      logo_url: c.logo_url,
      primary_color: c.primary_color,
    }];
  }
  return fetchRows<VyronCompany>("vyron_companies", [demoCompany], "company_name");
}

export async function getEnterpriseBranches() {
  if ((await workspaceScope()).useDemo) return demoBranches;
  return fetchRows<VyronBranch>("vyron_branches", demoBranches, "branch_name");
}

export async function getEnterpriseAlerts() {
  if ((await workspaceScope()).useDemo) return buildHandcraftedAlerts();
  return fetchRows<VyronCostAlert>("vyron_cost_alerts", demoAlerts, "created_at");
}

export async function getEnterpriseInvoiceHeaders() {
  return fetchRows<VyronInvoiceHeader>("vyron_cost_invoice_headers", demoInvoices, "created_at");
}

export async function getEnterpriseInvoiceLines() {
  return fetchRows<VyronInvoiceLine>("vyron_cost_invoice_lines", demoInvoiceLines, "created_at");
}

export async function getEnterprisePriceMovements() {
  return fetchRows<VyronPriceMovement>("vyron_cost_price_movements", demoPriceMovements, "detected_at");
}

export async function getEnterpriseActivityLogs() {
  return fetchRows<VyronActivityLog>("vyron_activity_logs", demoActivity, "created_at");
}
