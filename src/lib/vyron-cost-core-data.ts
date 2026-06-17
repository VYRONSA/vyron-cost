import { supabase } from "@/lib/supabase";

import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type CostSupplier = {
  id: string;
  supplier_name: string;
  category?: string | null;
  contact_email?: string | null;
  invoice_email?: string | null;
  phone?: string | null;
  risk_status?: string | null;
  last_price_movement?: number | null;
  payment_terms?: string | null;
  lead_time_days?: number | null;
  notes?: string | null;
};

export type CostIngredient = {
  id: string;
  ingredient_name: string;
  category?: string | null;
  supplier_id?: string | null;
  purchase_unit?: string | null;
  recipe_unit?: string | null;
  purchase_cost?: number | null;
  previous_cost?: number | null;
  yield_type?: string | null;
  yield_percent?: number | null;
  true_unit_cost?: number | null;
  current_alert?: string | null;
};

export function formatMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateMovementPercent(previousCost: number, currentCost: number) {
  if (!previousCost || previousCost <= 0) return 0;
  return ((currentCost - previousCost) / previousCost) * 100;
}

export function calculateTrueUnitCost(cost: number, yieldPercent: number) {
  if (!yieldPercent || yieldPercent <= 0) return cost;
  return cost / (yieldPercent / 100);
}

export const demoSuppliers: CostSupplier[] = [
  { id: "demo-supplier-1", supplier_name: "Cape Premium Meats", category: "Protein", contact_email: "orders@demo.co.za", invoice_email: "invoices@demo.co.za", risk_status: "Review", last_price_movement: 12.5, payment_terms: "30 Days" },
  { id: "demo-supplier-2", supplier_name: "PackRight Cape", category: "Packaging", contact_email: "sales@demo.co.za", invoice_email: "accounts@demo.co.za", risk_status: "Monitor", last_price_movement: 8.2, payment_terms: "30 Days" },
];

export const demoIngredients: CostIngredient[] = [
  { id: "demo-ing-1", ingredient_name: "Beef Mince", category: "Protein", supplier_id: "demo-supplier-1", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 94, previous_cost: 82, yield_type: "Trim loss", yield_percent: 92, true_unit_cost: 102.17, current_alert: "Supplier increase" },
  { id: "demo-ing-2", ingredient_name: "Pie Foil Tray", category: "Packaging", supplier_id: "demo-supplier-2", purchase_unit: "unit", recipe_unit: "unit", purchase_cost: 1.35, previous_cost: 1.12, yield_type: "Standard", yield_percent: 100, true_unit_cost: 1.35, current_alert: "Packaging increase" },
];

export async function getSuppliers(): Promise<CostSupplier[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? demoSuppliers : [];
  if (!companyId) return useDemo ? demoSuppliers : [];

  let query = supabase.from("vyron_cost_suppliers").select("*").order("supplier_name", { ascending: true }).limit(1000);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error || !data) return useDemo ? demoSuppliers : [];
  return data as CostSupplier[];
}

export async function getSupplierById(id: string): Promise<CostSupplier | null> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return null;
  if (!supabase || (useDemo && id.startsWith("demo"))) {
    return useDemo ? demoSuppliers.find((s) => s.id === id) || null : null;
  }
  if (!companyId) return null;
  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CostSupplier;
}

export async function getIngredients(): Promise<CostIngredient[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? demoIngredients : [];
  if (!companyId) return useDemo ? demoIngredients : [];

  let query = supabase.from("vyron_cost_ingredients").select("*").order("ingredient_name", { ascending: true }).limit(1000);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error || !data) return useDemo ? demoIngredients : [];
  return data as CostIngredient[];
}

export async function getIngredientById(id: string): Promise<CostIngredient | null> {
  const { useDemo } = await workspaceScope();
  if (!supabase || (useDemo && id.startsWith("demo"))) {
    return useDemo ? demoIngredients.find((i) => i.id === id) || null : null;
  }
  const { companyId } = await workspaceScope();
  let query = supabase.from("vyron_cost_ingredients").select("*").eq("id", id);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as CostIngredient;
}
