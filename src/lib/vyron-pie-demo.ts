import type { VyronApproval } from "@/lib/vyron-approval-data";
import type { Ingredient, Product, Supplier } from "@/lib/vyron-cost-data";
import type {
  BranchRiskFinding,
  FinancialLeakageDashboard,
  InvoiceRiskFinding,
  LeakageFinding,
  ProcurementRiskFinding,
} from "@/lib/vyron-leakage-intelligence-data";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import type { VyronBranch, VyronCompany, VyronCostAlert } from "@/lib/vyron-enterprise-data";

export type PieSupplierIntelligenceRow = {
  id: string;
  supplier_name: string;
  category: string;
  invoice_count: number;
  invoice_value: number;
  avg_price_movement: number;
  high_risk_movements: number;
  unmatched_invoice_lines: number;
  ai_confidence_avg: number;
  risk_score: number;
  risk_level: string;
  action_required: string;
  inflation_trend: string;
  dependency_risk: string;
  invoice_irregularities: number;
};

export const PIE_DEMO_ENABLED =
  process.env.NEXT_PUBLIC_VYRON_DEMO !== "false" && process.env.NEXT_PUBLIC_VYRON_PIE_DEMO !== "false";

export function shouldUsePieDemo() {
  return PIE_DEMO_ENABLED;
}

export const pieCompanyName = "Vyron Pie Co";
export const pieCompanyTagline = "PIE MANUFACTURING DEMO";

export const pieDemoCompany: VyronCompany = {
  id: "pie-company-demo",
  company_name: "Vyron Pie Co",
  trading_name: "Vyron Pie Manufacturing",
  subscription_plan: "Enterprise",
  subscription_status: "Active",
  currency_code: "ZAR",
  vat_percent: 15,
  logo_url: null,
  primary_color: "#10b981",
};

export const pieDemoBranches: VyronBranch[] = [
  {
    id: "pie-branch-1",
    company_id: "pie-company-demo",
    branch_name: "Johannesburg Factory",
    branch_code: "JHB-FAC",
    city: "Johannesburg",
    region: "Gauteng",
    contact_email: "factory@vyronpie.co.za",
    contact_phone: "011 482 9100",
    is_active: true,
  },
  {
    id: "pie-branch-2",
    company_id: "pie-company-demo",
    branch_name: "Cape Town Depot",
    branch_code: "CPT-DEP",
    city: "Cape Town",
    region: "Western Cape",
    contact_email: "cpt@vyronpie.co.za",
    contact_phone: "021 441 2200",
    is_active: true,
  },
  {
    id: "pie-branch-3",
    company_id: "pie-company-demo",
    branch_name: "Durban Outlet",
    branch_code: "DBN-OUT",
    city: "Durban",
    region: "KZN",
    contact_email: "dbn@vyronpie.co.za",
    contact_phone: "031 902 1100",
    is_active: true,
  },
];

export const pieDemoSuppliers: Supplier[] = [
  {
    id: "pie-sup-meat",
    company_id: "pie-company-demo",
    supplier_name: "Meat Supplier",
    category: "Meat",
    contact_email: "orders@meatsupplier.co.za",
    invoice_email: "invoices@meatsupplier.co.za",
    risk_status: "Critical",
    last_price_movement: 12.4,
  },
  {
    id: "pie-sup-dry",
    company_id: "pie-company-demo",
    supplier_name: "Dry Goods Supplier",
    category: "Dry Goods",
    contact_email: "sales@drygoods.co.za",
    invoice_email: "billing@drygoods.co.za",
    risk_status: "Stable",
    last_price_movement: 2.1,
  },
  {
    id: "pie-sup-pack",
    company_id: "pie-company-demo",
    supplier_name: "Packaging Supplier",
    category: "Packaging",
    contact_email: "orders@packsupplier.co.za",
    invoice_email: "ap@packsupplier.co.za",
    risk_status: "High Risk",
    last_price_movement: 8.7,
  },
  {
    id: "pie-sup-dairy",
    company_id: "pie-company-demo",
    supplier_name: "Dairy Supplier",
    category: "Dairy",
    contact_email: "dispatch@dairysupplier.co.za",
    invoice_email: "invoices@dairysupplier.co.za",
    risk_status: "Stable",
    last_price_movement: 3.4,
  },
  {
    id: "pie-sup-spice",
    company_id: "pie-company-demo",
    supplier_name: "Spice Supplier",
    category: "Spices",
    contact_email: "trade@spicesupplier.co.za",
    invoice_email: "finance@spicesupplier.co.za",
    risk_status: "Watch",
    last_price_movement: 4.2,
  },
];

export const pieDemoIngredients: Ingredient[] = [
  { id: "pie-ing-flour", company_id: "pie-company-demo", ingredient_name: "Flour", category: "Dry Goods", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 14.2, previous_cost: 13.8, yield_type: "none", yield_percent: 100, true_unit_cost: 14.2, current_alert: null },
  { id: "pie-ing-beef", company_id: "pie-company-demo", ingredient_name: "Beef", category: "Meat", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 118.5, previous_cost: 105.4, yield_type: "weight_loss", yield_percent: 92, true_unit_cost: 128.8, current_alert: "Meat supplier increase +12.4%." },
  { id: "pie-ing-chicken", company_id: "pie-company-demo", ingredient_name: "Chicken", category: "Meat", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 72.4, previous_cost: 68.9, yield_type: "weight_loss", yield_percent: 94, true_unit_cost: 77.02, current_alert: "Chicken cost pressure on Chicken Pie GP." },
  { id: "pie-ing-marg", company_id: "pie-company-demo", ingredient_name: "Pastry Margarine", category: "Dry Goods", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 38.6, previous_cost: 37.2, yield_type: "none", yield_percent: 100, true_unit_cost: 38.6, current_alert: "Pastry wastage above normal." },
  { id: "pie-ing-oil", company_id: "pie-company-demo", ingredient_name: "Oil", category: "Dry Goods", purchase_unit: "L", recipe_unit: "L", purchase_cost: 28.5, previous_cost: 27.9, yield_type: "none", yield_percent: 100, true_unit_cost: 28.5, current_alert: null },
  { id: "pie-ing-onion", company_id: "pie-company-demo", ingredient_name: "Onion", category: "Vegetables", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 12.8, previous_cost: 12.1, yield_type: "weight_loss", yield_percent: 88, true_unit_cost: 14.55, current_alert: null },
  { id: "pie-ing-pepper", company_id: "pie-company-demo", ingredient_name: "Pepper", category: "Spices", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 86, previous_cost: 84.5, yield_type: "none", yield_percent: 100, true_unit_cost: 86, current_alert: null },
  { id: "pie-ing-gravy", company_id: "pie-company-demo", ingredient_name: "Gravy Powder", category: "Dry Goods", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 42.3, previous_cost: 41.8, yield_type: "none", yield_percent: 100, true_unit_cost: 42.3, current_alert: null },
  { id: "pie-ing-salt", company_id: "pie-company-demo", ingredient_name: "Salt", category: "Spices", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 8.4, previous_cost: 8.2, yield_type: "none", yield_percent: 100, true_unit_cost: 8.4, current_alert: null },
  { id: "pie-ing-trays", company_id: "pie-company-demo", ingredient_name: "Pie Trays", category: "Packaging", purchase_unit: "unit", recipe_unit: "unit", purchase_cost: 1.85, previous_cost: 1.72, yield_type: "none", yield_percent: 100, true_unit_cost: 1.85, current_alert: "Packaging up 8.7%." },
  { id: "pie-ing-labels", company_id: "pie-company-demo", ingredient_name: "Packaging Labels", category: "Packaging", purchase_unit: "unit", recipe_unit: "unit", purchase_cost: 0.42, previous_cost: 0.39, yield_type: "none", yield_percent: 100, true_unit_cost: 0.42, current_alert: "Packaging up 8.7%." },
  { id: "pie-ing-boxes", company_id: "pie-company-demo", ingredient_name: "Boxes", category: "Packaging", purchase_unit: "unit", recipe_unit: "unit", purchase_cost: 3.28, previous_cost: 3.02, yield_type: "none", yield_percent: 100, true_unit_cost: 3.28, current_alert: "Packaging up 8.7%." },
];

export const pieDemoProducts: Product[] = [
  { id: "pie-prod-beef", company_id: "pie-company-demo", product_name: "Beef Pie", category: "Savory Pies", status: "Active", selling_price: 28.9, total_cost: 16.42, target_gp: 42, salary_cost: 2.1, packaging_cost: 1.85, overhead_cost: 1.2, wastage_percent: 4, extracted_line_count: 9 },
  { id: "pie-prod-chicken", company_id: "pie-company-demo", product_name: "Chicken Pie", category: "Savory Pies", status: "Active", selling_price: 26.9, total_cost: 18.84, target_gp: 42, salary_cost: 2.1, packaging_cost: 1.85, overhead_cost: 1.2, wastage_percent: 5, extracted_line_count: 9 },
  { id: "pie-prod-pepper", company_id: "pie-company-demo", product_name: "Pepper Steak Pie", category: "Savory Pies", status: "Active", selling_price: 31.9, total_cost: 17.88, target_gp: 42, salary_cost: 2.1, packaging_cost: 1.85, overhead_cost: 1.2, wastage_percent: 4, extracted_line_count: 10 },
  { id: "pie-prod-kidney", company_id: "pie-company-demo", product_name: "Steak & Kidney Pie", category: "Savory Pies", status: "Active", selling_price: 32.9, total_cost: 18.62, target_gp: 42, salary_cost: 2.1, packaging_cost: 1.85, overhead_cost: 1.2, wastage_percent: 4, extracted_line_count: 10 },
  { id: "pie-prod-roll", company_id: "pie-company-demo", product_name: "Sausage Roll", category: "Bakery", status: "Active", selling_price: 18.9, total_cost: 9.44, target_gp: 45, salary_cost: 1.4, packaging_cost: 1.1, overhead_cost: 0.8, wastage_percent: 3, extracted_line_count: 7 },
  { id: "pie-prod-spinach", company_id: "pie-company-demo", product_name: "Spinach & Feta Pie", category: "Vegetarian", status: "Active", selling_price: 27.9, total_cost: 14.28, target_gp: 42, salary_cost: 2, packaging_cost: 1.85, overhead_cost: 1.1, wastage_percent: 3, extracted_line_count: 8 },
  { id: "pie-prod-party", company_id: "pie-company-demo", product_name: "Party Pies", category: "Bulk", status: "Active", selling_price: 89, total_cost: 48.6, target_gp: 40, salary_cost: 4.2, packaging_cost: 6.4, overhead_cost: 3.8, wastage_percent: 6, extracted_line_count: 11 },
  { id: "pie-prod-pastry", company_id: "pie-company-demo", product_name: "Pastry Sheets", category: "Manufacturing", status: "Active", selling_price: 54.9, total_cost: 28.4, target_gp: 38, salary_cost: 3.2, packaging_cost: 2.4, overhead_cost: 2.1, wastage_percent: 12, extracted_line_count: 6 },
];

export const pieDemoProductIntelligence: ProductIntelligenceRow[] = [
  { id: "pie-pi-1", product_id: "pie-prod-chicken", product_name: "Chicken Pie", category: "Savory Pies", selling_price: 26.9, total_cost: 18.84, target_gp: 42, actual_gp: 29.9, gp_gap: 12.1, suggested_price: 32.48, monthly_units_estimate: 8400, monthly_risk_value: 46872, risk_level: "Critical", action_required: "Increase Price" },
  { id: "pie-pi-2", product_id: "pie-prod-beef", product_name: "Beef Pie", category: "Savory Pies", selling_price: 28.9, total_cost: 16.42, target_gp: 42, actual_gp: 43.2, gp_gap: 0, suggested_price: 28.9, monthly_units_estimate: 6200, monthly_risk_value: 0, risk_level: "Low", action_required: "Monitor" },
  { id: "pie-pi-3", product_id: "pie-prod-pepper", product_name: "Pepper Steak Pie", category: "Savory Pies", selling_price: 31.9, total_cost: 17.88, target_gp: 42, actual_gp: 44, gp_gap: 0, suggested_price: 31.9, monthly_units_estimate: 4100, monthly_risk_value: 0, risk_level: "Low", action_required: "Monitor" },
  { id: "pie-pi-4", product_id: "pie-prod-kidney", product_name: "Steak & Kidney Pie", category: "Savory Pies", selling_price: 32.9, total_cost: 18.62, target_gp: 42, actual_gp: 43.4, gp_gap: 0, suggested_price: 32.9, monthly_units_estimate: 2800, monthly_risk_value: 0, risk_level: "Low", action_required: "Monitor" },
  { id: "pie-pi-5", product_id: "pie-prod-roll", product_name: "Sausage Roll", category: "Bakery", selling_price: 18.9, total_cost: 9.44, target_gp: 45, actual_gp: 50.1, gp_gap: 0, suggested_price: 18.9, monthly_units_estimate: 11200, monthly_risk_value: 0, risk_level: "Low", action_required: "Monitor" },
  { id: "pie-pi-6", product_id: "pie-prod-spinach", product_name: "Spinach & Feta Pie", category: "Vegetarian", selling_price: 27.9, total_cost: 14.28, target_gp: 42, actual_gp: 48.8, gp_gap: 0, suggested_price: 27.9, monthly_units_estimate: 3600, monthly_risk_value: 0, risk_level: "Low", action_required: "Monitor" },
  { id: "pie-pi-7", product_id: "pie-prod-party", product_name: "Party Pies", category: "Bulk", selling_price: 89, total_cost: 48.6, target_gp: 40, actual_gp: 45.4, gp_gap: 0, suggested_price: 89, monthly_units_estimate: 1200, monthly_risk_value: 0, risk_level: "Medium", action_required: "Review Wastage" },
  { id: "pie-pi-8", product_id: "pie-prod-pastry", product_name: "Pastry Sheets", category: "Manufacturing", selling_price: 54.9, total_cost: 28.4, target_gp: 38, actual_gp: 48.3, gp_gap: 0, suggested_price: 54.9, monthly_units_estimate: 2200, monthly_risk_value: 18480, risk_level: "High", action_required: "Fix Pastry Yield" },
];

export const pieDemoSupplierIntelligence: PieSupplierIntelligenceRow[] = [
  { id: "pie-si-1", supplier_name: "Meat Supplier", category: "Meat", invoice_count: 14, invoice_value: 248600, avg_price_movement: 12.4, high_risk_movements: 3, unmatched_invoice_lines: 1, ai_confidence_avg: 91, risk_score: 78.2, risk_level: "Critical", action_required: "Approve Increase", inflation_trend: "Rising", dependency_risk: "High", invoice_irregularities: 2 },
  { id: "pie-si-2", supplier_name: "Packaging Supplier", category: "Packaging", invoice_count: 9, invoice_value: 86400, avg_price_movement: 8.7, high_risk_movements: 2, unmatched_invoice_lines: 2, ai_confidence_avg: 88, risk_score: 64.5, risk_level: "High", action_required: "Review Packaging", inflation_trend: "Rising", dependency_risk: "Medium", invoice_irregularities: 1 },
  { id: "pie-si-3", supplier_name: "Dry Goods Supplier", category: "Dry Goods", invoice_count: 11, invoice_value: 92400, avg_price_movement: 2.1, high_risk_movements: 0, unmatched_invoice_lines: 0, ai_confidence_avg: 96, risk_score: 18.4, risk_level: "Low", action_required: "Monitor", inflation_trend: "Stable", dependency_risk: "Low", invoice_irregularities: 0 },
  { id: "pie-si-4", supplier_name: "Dairy Supplier", category: "Dairy", invoice_count: 7, invoice_value: 48200, avg_price_movement: 3.4, high_risk_movements: 0, unmatched_invoice_lines: 0, ai_confidence_avg: 94, risk_score: 22.1, risk_level: "Low", action_required: "Monitor", inflation_trend: "Stable", dependency_risk: "Low", invoice_irregularities: 0 },
  { id: "pie-si-5", supplier_name: "Spice Supplier", category: "Spices", invoice_count: 5, invoice_value: 28400, avg_price_movement: 4.2, high_risk_movements: 0, unmatched_invoice_lines: 0, ai_confidence_avg: 92, risk_score: 28.6, risk_level: "Low", action_required: "Monitor", inflation_trend: "Stable", dependency_risk: "Low", invoice_irregularities: 0 },
];

export const pieDemoLeakageFindings: LeakageFinding[] = [
  { id: "pie-lf-1", finding_type: "Supplier Inflation", title: "Meat supplier +12.4%", description: "Beef and filling costs increased on latest invoice.", estimated_monthly_loss: 28400, severity: "Critical", status: "Open", branch_name: null, category_name: "Meat", supplier_name: "Meat Supplier" },
  { id: "pie-lf-2", finding_type: "Supplier Inflation", title: "Packaging +8.7%", description: "Pie trays, labels and boxes increased.", estimated_monthly_loss: 12680, severity: "High", status: "Open", branch_name: null, category_name: "Packaging", supplier_name: "Packaging Supplier" },
  { id: "pie-lf-3", finding_type: "Duplicate Invoice", title: "Duplicate meat invoice risk", description: "Same supplier, same amount, two invoice numbers.", estimated_monthly_loss: 18420, severity: "Critical", status: "Investigate", branch_name: null, category_name: null, supplier_name: "Meat Supplier" },
  { id: "pie-lf-4", finding_type: "Margin Erosion", title: "Chicken Pie below target GP", description: "GP at 29.9% vs 42% target after chicken cost rise.", estimated_monthly_loss: 46872, severity: "Critical", status: "Investigate", branch_name: null, category_name: "Savory Pies", supplier_name: null },
  { id: "pie-lf-5", finding_type: "Wastage Loss", title: "Pastry wastage above normal", description: "Pastry Sheets yield loss 12% vs 8% standard.", estimated_monthly_loss: 18480, severity: "High", status: "Open", branch_name: "Johannesburg Factory", category_name: "Manufacturing", supplier_name: null },
  { id: "pie-lf-6", finding_type: "Branch Overspend", title: "Durban Outlet overspending", description: "Procurement spend 19% above outlet benchmark.", estimated_monthly_loss: 22400, severity: "High", status: "Open", branch_name: "Durban Outlet", category_name: null, supplier_name: null },
  { id: "pie-lf-7", finding_type: "Price Action", title: "Selling price increase suggested", description: "Chicken Pie suggested price R32.48 to restore GP.", estimated_monthly_loss: 0, severity: "Medium", status: "Open", branch_name: null, category_name: "Savory Pies", supplier_name: null },
];

export const pieDemoInvoiceRiskFindings: InvoiceRiskFinding[] = [
  { id: "pie-ir-1", invoice_number: "MEAT-8841", supplier_name: "Meat Supplier", invoice_amount: 24850, risk_type: "Duplicate Invoice", risk_score: 93.2, ai_confidence: 95, duplicate_of: "MEAT-8720", review_status: "Pending Review" },
  { id: "pie-ir-2", invoice_number: "MEAT-8720", supplier_name: "Meat Supplier", invoice_amount: 24850, risk_type: "Duplicate Match", risk_score: 92.8, ai_confidence: 94.5, duplicate_of: "MEAT-8841", review_status: "Pending Review" },
  { id: "pie-ir-3", invoice_number: "MEAT-9102", supplier_name: "Meat Supplier", invoice_amount: 62400, risk_type: "Unusual Value", risk_score: 71.4, ai_confidence: 88, duplicate_of: null, review_status: "Monitor" },
  { id: "pie-ir-4", invoice_number: "PACK-3301", supplier_name: "Packaging Supplier", invoice_amount: 9840, risk_type: "Price Increase", risk_score: 68.2, ai_confidence: 90, duplicate_of: null, review_status: "Pending Review" },
  { id: "pie-ir-5", invoice_number: "PACK-3298", supplier_name: "Packaging Supplier", invoice_amount: 8640, risk_type: "Packaging Spike", risk_score: 62.5, ai_confidence: 86, duplicate_of: null, review_status: "Monitor" },
];

export const pieDemoProcurementRiskFindings: ProcurementRiskFinding[] = [
  { id: "pie-pr-1", supplier_name: "Meat Supplier", category_name: "Meat", risk_type: "Supplier Inflation", risk_score: 86.4, price_change_percent: 12.4, spend_amount: 248600, action_required: "Approve Price Increase" },
  { id: "pie-pr-2", supplier_name: "Packaging Supplier", category_name: "Packaging", risk_type: "Packaging Increase", risk_score: 72.8, price_change_percent: 8.7, spend_amount: 86400, action_required: "Review Contract" },
  { id: "pie-pr-3", supplier_name: "Meat Supplier", category_name: "Meat", risk_type: "Duplicate Invoice", risk_score: 91.2, price_change_percent: 0, spend_amount: 24850, action_required: "Investigate Duplicate" },
];

export const pieDemoBranchRiskFindings: BranchRiskFinding[] = [
  { id: "pie-br-1", branch_name: "Durban Outlet", spend_total: 186400, wastage_estimate: 14200, invoice_volume: 84, gp_erosion_percent: 4.2, procurement_efficiency: 68, leakage_score: 72.4, risk_level: "Critical" },
  { id: "pie-br-2", branch_name: "Johannesburg Factory", spend_total: 624800, wastage_estimate: 42800, invoice_volume: 212, gp_erosion_percent: 3.8, procurement_efficiency: 78, leakage_score: 58.2, risk_level: "High" },
  { id: "pie-br-3", branch_name: "Cape Town Depot", spend_total: 312400, wastage_estimate: 18600, invoice_volume: 118, gp_erosion_percent: 2.4, procurement_efficiency: 86, leakage_score: 32.1, risk_level: "Medium" },
];

export const pieDemoApprovals: VyronApproval[] = [
  {
    id: "pie-ap-1",
    approval_type: "Supplier Increase",
    entity_type: "Ingredient",
    entity_id: "pie-ing-beef",
    title: "Approve Meat Supplier +12.4%",
    detail: "Beef price increased on latest Meat Supplier invoice. Affects Beef Pie, Pepper Steak Pie and Steak & Kidney Pie.",
    risk_level: "High",
    current_value: 105.4,
    proposed_value: 118.5,
    financial_impact: 28400,
    status: "Pending",
    requested_by: "VYRON AI",
    approved_by: null,
    decision_note: null,
  },
  {
    id: "pie-ap-2",
    approval_type: "GP Override",
    entity_type: "Product",
    entity_id: "pie-prod-chicken",
    title: "Chicken Pie GP below target",
    detail: "GP at 29.9% vs 42% target. Approve selling price increase to R32.48 or margin override.",
    risk_level: "Critical",
    current_value: 26.9,
    proposed_value: 32.48,
    financial_impact: 46872,
    status: "Pending",
    requested_by: "VYRON AI",
    approved_by: null,
    decision_note: null,
  },
  {
    id: "pie-ap-3",
    approval_type: "Duplicate Invoice",
    entity_type: "Invoice",
    entity_id: "MEAT-8841",
    title: "Review duplicate meat invoice",
    detail: "MEAT-8841 matches MEAT-8720 — same supplier and amount.",
    risk_level: "Critical",
    current_value: 24850,
    proposed_value: 0,
    financial_impact: 24850,
    status: "Pending",
    requested_by: "VYRON AI",
    approved_by: null,
    decision_note: null,
  },
  {
    id: "pie-ap-4",
    approval_type: "Packaging Increase",
    entity_type: "Supplier",
    entity_id: "pie-sup-pack",
    title: "Packaging Supplier +8.7%",
    detail: "Pie trays, labels and boxes increased. Review pass-through to retail packs.",
    risk_level: "Medium",
    current_value: 86400,
    proposed_value: 93980,
    financial_impact: 12680,
    status: "Pending",
    requested_by: "VYRON AI",
    approved_by: null,
    decision_note: null,
  },
];

export const pieDemoAlerts: VyronCostAlert[] = [
  { id: "pie-alert-1", company_id: "pie-company-demo", branch_id: "pie-branch-1", severity: "Critical", alert_type: "GP Risk", alert_title: "Chicken Pie below target GP", alert_message: "GP at 29.9%. Suggested price R32.48 generated.", is_read: false },
  { id: "pie-alert-2", company_id: "pie-company-demo", branch_id: "pie-branch-1", severity: "High", alert_type: "Supplier Inflation", alert_title: "Meat Supplier +12.4%", alert_message: "Beef and meat filling costs increased on latest invoice.", is_read: false },
  { id: "pie-alert-3", company_id: "pie-company-demo", branch_id: "pie-branch-1", severity: "High", alert_type: "Duplicate Invoice", alert_title: "Duplicate invoice risk", alert_message: "MEAT-8841 may duplicate MEAT-8720.", is_read: false },
  { id: "pie-alert-4", company_id: "pie-company-demo", branch_id: "pie-branch-1", severity: "Medium", alert_type: "Packaging Increase", alert_title: "Packaging +8.7%", alert_message: "Pie trays, labels and boxes increased.", is_read: false },
  { id: "pie-alert-5", company_id: "pie-company-demo", branch_id: "pie-branch-2", severity: "High", alert_type: "Wastage", alert_title: "Pastry wastage above normal", alert_message: "Pastry Sheets wastage at 12% vs 8% standard.", is_read: false },
  { id: "pie-alert-6", company_id: "pie-company-demo", branch_id: "pie-branch-3", severity: "High", alert_type: "Branch Overspend", alert_title: "Durban Outlet overspending", alert_message: "Spend 19% above outlet benchmark.", is_read: false },
];

export const pieSprint1Kpis = {
  moneyAtRisk: 147252,
  supplierInflationExposure: 41080,
  productsBelowGp: 65352,
  duplicateInvoiceRisks: 18420,
  wastageLosses: 18480,
  procurementAnomalies: 22400,
  recoverableMonthly: 118420,
  recoverableAnnual: 1421040,
  recoveryRatePercent: 80,
};

export const pieDemoDashboard = {
  moneyAtRisk: pieSprint1Kpis.moneyAtRisk,
  gpRiskProducts: 2,
  invoiceQueue: 2,
  supplierMovement: 12.4,
  monthlyLeakage: pieSprint1Kpis.moneyAtRisk,
  activeInvestigations: 2,
  pendingApprovals: 4,
  recoverableMonthly: pieSprint1Kpis.recoverableMonthly,
};

export type PieSupplierInflationRow = {
  id: string;
  supplier_name: string;
  category: string;
  price_change_percent: number;
  monthly_spend: number;
  monthly_loss: number;
  recoverable: number;
  affected_products: string;
  risk_level: string;
  action_required: string;
};

export const pieSupplierInflationImpact: PieSupplierInflationRow[] = [
  {
    id: "inf-1",
    supplier_name: "Meat Supplier",
    category: "Meat",
    price_change_percent: 12.4,
    monthly_spend: 248600,
    monthly_loss: 28400,
    recoverable: 22720,
    affected_products: "Beef Pie, Pepper Steak Pie, Steak & Kidney Pie, Chicken Pie",
    risk_level: "Critical",
    action_required: "Approve Increase",
  },
  {
    id: "inf-2",
    supplier_name: "Packaging Supplier",
    category: "Packaging",
    price_change_percent: 8.7,
    monthly_spend: 86400,
    monthly_loss: 12680,
    recoverable: 10144,
    affected_products: "All retail packs, Party Pies",
    risk_level: "High",
    action_required: "Review Contract",
  },
  {
    id: "inf-3",
    supplier_name: "Dry Goods Supplier",
    category: "Dry Goods",
    price_change_percent: 2.1,
    monthly_spend: 92400,
    monthly_loss: 1940,
    recoverable: 1552,
    affected_products: "Flour, Pastry Sheets",
    risk_level: "Low",
    action_required: "Monitor",
  },
  {
    id: "inf-4",
    supplier_name: "Dairy Supplier",
    category: "Dairy",
    price_change_percent: 3.4,
    monthly_spend: 48200,
    monthly_loss: 1640,
    recoverable: 1312,
    affected_products: "Spinach & Feta Pie",
    risk_level: "Low",
    action_required: "Monitor",
  },
  {
    id: "inf-5",
    supplier_name: "Spice Supplier",
    category: "Spices",
    price_change_percent: 4.2,
    monthly_spend: 28400,
    monthly_loss: 1190,
    recoverable: 952,
    affected_products: "All savory pies",
    risk_level: "Low",
    action_required: "Monitor",
  },
];

export const pieAiFinancialFeed = [
  {
    id: "ai-1",
    headline: "Meat Supplier +12.4%",
    detail: "Beef and filling costs up. Beef Pie margin pressure building.",
    lossAmount: 28400,
    recoverableAmount: 22720,
    severity: "Critical",
    action: "Supplier Inflation",
    href: "/supplier-inflation-impact",
    time: "2 min ago",
  },
  {
    id: "ai-2",
    headline: "Chicken Pie below target GP",
    detail: "GP at 29.9% vs 42%. Price increase to R32.48 recommended.",
    lossAmount: 46872,
    recoverableAmount: 37498,
    severity: "Critical",
    action: "Product Profitability",
    href: "/product-profitability",
    time: "6 min ago",
  },
  {
    id: "ai-3",
    headline: "Duplicate meat invoice flagged",
    detail: "MEAT-8841 matches MEAT-8720. Possible double payment.",
    lossAmount: 18420,
    recoverableAmount: 18420,
    severity: "Critical",
    action: "Invoice Forensics",
    href: "/invoice-forensics",
    time: "11 min ago",
  },
  {
    id: "ai-4",
    headline: "Packaging +8.7%",
    detail: "Pie trays, labels and boxes increased across supplier.",
    lossAmount: 12680,
    recoverableAmount: 10144,
    severity: "High",
    action: "Supplier Inflation",
    href: "/supplier-inflation-impact",
    time: "18 min ago",
  },
  {
    id: "ai-5",
    headline: "Pastry wastage breach",
    detail: "Pastry Sheets at 12% loss vs 8% standard.",
    lossAmount: 18480,
    recoverableAmount: 12936,
    severity: "High",
    action: "Financial Leakage",
    href: "/financial-leakage",
    time: "24 min ago",
  },
  {
    id: "ai-6",
    headline: "Durban Outlet overspend",
    detail: "Outlet procurement 19% above benchmark.",
    lossAmount: 22400,
    recoverableAmount: 15680,
    severity: "High",
    action: "Branch Intelligence",
    href: "/branch-intelligence",
    time: "31 min ago",
  },
];

export function buildPieLeakageDashboard(findings: LeakageFinding[]): FinancialLeakageDashboard {
  const sum = (type: string) =>
    findings
      .filter((row) => String(row.finding_type || "").toLowerCase().includes(type.toLowerCase()))
      .reduce((total, row) => total + Number(row.estimated_monthly_loss || 0), 0);

  return {
    estimatedMonthlyLeakage: findings.reduce((total, row) => total + Number(row.estimated_monthly_loss || 0), 0),
    duplicateInvoiceRisk: sum("duplicate"),
    supplierInflationExposure: sum("inflation"),
    branchOverspending: sum("branch"),
    wastageLossEstimate: sum("wastage"),
    procurementAnomalies: sum("packaging"),
    categoryMarginErosion: sum("margin"),
    highRiskSuppliers: 2,
    activeInvestigations: findings.filter((row) => String(row.status || "").toLowerCase().includes("investigate")).length,
  };
}

export const pieDemoLeakageDashboard = buildPieLeakageDashboard(pieDemoLeakageFindings);

export const pieDemoTimeline = [
  { title: "MEAT SUPPLIER +12.4%", detail: "Beef price increase detected on latest invoice.", time: "3 min ago" },
  { title: "CHICKEN PIE GP ALERT", detail: "GP below target. Suggested price R32.48.", time: "7 min ago" },
  { title: "DUPLICATE INVOICE FLAG", detail: "MEAT-8841 matches MEAT-8720.", time: "12 min ago" },
  { title: "PASTRY WASTAGE BREACH", detail: "Pastry Sheets wastage above normal.", time: "28 min ago" },
];

export const pieDemoApprovalQueue = [
  { type: "SUPPLIER INCREASE", item: "Meat Supplier +12.4%", risk: "HIGH" },
  { type: "GP OVERRIDE", item: "Chicken Pie below target GP", risk: "CRITICAL" },
  { type: "DUPLICATE INVOICE", item: "MEAT-8841 review", risk: "CRITICAL" },
];
