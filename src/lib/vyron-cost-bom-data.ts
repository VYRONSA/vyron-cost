import { supabase } from "@/lib/supabase";
import { CostIngredient, demoIngredients, getIngredients } from "@/lib/vyron-cost-core-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type BomHeader = {
  id: string;
  bom_name: string;
  category?: string | null;
  yield_qty?: number | null;
  yield_unit?: string | null;
  target_gp?: number | null;
  selling_price?: number | null;
  total_cost?: number | null;
  ingredient_cost?: number | null;
  packaging_cost?: number | null;
  cost_per_unit?: number | null;
  calculated_gp?: number | null;
  suggested_selling_price?: number | null;
  status?: string | null;
  notes?: string | null;
  product_id?: string | null;
  /** True when the recipe has a pack photo — the list uses it for a thumbnail. */
  has_image?: boolean | null;
  image_path?: string | null;
};

export type BomLine = {
  id: string;
  bom_id?: string;
  line_type: string;
  ingredient_id?: string | null;
  component_id?: string | null;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  line_cost?: number;
  sort_order?: number;
};

/**
 * Recipe quantities carry real workbook precision — 0.006250 kg of salmon is
 * not 0.0063. Rounding it on screen misreports the recipe, so whole numbers
 * stay whole and everything else shows the full six decimals the column stores.
 */
export function formatQuantity(value: number | null | undefined) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(6);
}

/**
 * Unit and line costs are stored to eight decimals. Showing all eight would
 * turn R380.00 into R380.00000000, so trailing zeros are trimmed and at least
 * two decimals kept — R380.00, R4.3335, R27.052596, R1.7414892.
 */
export function formatPreciseMoney(value: number | null | undefined) {
  const n = Number(value || 0);
  const trimmed = n.toFixed(8).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  const [whole, decimals = ""] = trimmed.split(".");
  const padded = decimals.length < 2 ? decimals.padEnd(2, "0") : decimals;
  const grouped = Number(whole).toLocaleString("en-ZA");
  return `R${grouped}.${padded}`;
}

export function formatMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calcLineCost(line: Pick<BomLine, "quantity" | "unit_cost" | "wastage_percent">) {
  return Number(line.quantity || 0) * Number(line.unit_cost || 0) * (1 + Number(line.wastage_percent || 0) / 100);
}

export function calcGp(sellingPrice: number, cost: number) {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

export function calcSuggestedPrice(cost: number, targetGp: number) {
  if (!targetGp || targetGp >= 100) return cost;
  return cost / (1 - targetGp / 100);
}

export async function getBomIngredients(): Promise<CostIngredient[]> {
  return getIngredients();
}

export async function getBoms(): Promise<BomHeader[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? demoBoms : [];
  if (!companyId) return useDemo ? demoBoms : [];

  let query = supabase
    .from("vyron_cost_boms")
    .select("*")
    .neq("status", "Archived")
    .order("bom_name", { ascending: true })
    .limit(1000);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as BomHeader[];
}

export async function getBomById(id: string): Promise<{ bom: BomHeader | null; lines: BomLine[] }> {
  const { useDemo, companyId } = await workspaceScope();
  if (useDemo && (id.startsWith("demo") || !companyId)) {
    const bom = demoBoms.find((item) => item.id === id) || null;
    return { bom, lines: bom ? demoBomLines.filter((line) => line.bom_id === bom.id) : [] };
  }
  if (!supabase || !companyId) return { bom: null, lines: [] };

  const { data: bom, error } = await supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !bom) return { bom: null, lines: [] };

  const { data: lines } = await supabase
    .from("vyron_cost_bom_lines")
    .select("*")
    .eq("bom_id", id)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  return { bom: bom as BomHeader, lines: (lines || []) as BomLine[] };
}

export async function deleteBom(id: string) {
  if (id.startsWith("demo")) return;
  const { companyId } = await workspaceScope();
  if (!supabase || !companyId) return;
  const { error } = await supabase
    .from("vyron_cost_boms")
    .update({ status: "Archived", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

export const demoBoms: BomHeader[] = [
  {
    id: "demo-pepper-steak-bom",
    bom_name: "Pepper Steak Pie BOM",
    category: "Handcrafted Pies",
    yield_qty: 24,
    yield_unit: "pies",
    target_gp: 65,
    selling_price: 45,
    total_cost: 356.4,
    cost_per_unit: 14.85,
    calculated_gp: 67,
    suggested_selling_price: 42.43,
    status: "Approved",
  },
];

export const demoBomLines: BomLine[] = [
  { id: "demo-1", bom_id: "demo-pepper-steak-bom", line_type: "Ingredient", line_name: "Beef Mince", quantity: 2.4, unit: "kg", unit_cost: 94, wastage_percent: 3, line_cost: 232.37, sort_order: 1 },
  { id: "demo-2", bom_id: "demo-pepper-steak-bom", line_type: "Packaging", line_name: "Pie Foil Tray", quantity: 24, unit: "unit", unit_cost: 1.35, wastage_percent: 0, line_cost: 32.4, sort_order: 2 },
  { id: "demo-3", bom_id: "demo-pepper-steak-bom", line_type: "Labour", line_name: "Production Labour", quantity: 1, unit: "batch", unit_cost: 88, wastage_percent: 0, line_cost: 88, sort_order: 3 },
];
