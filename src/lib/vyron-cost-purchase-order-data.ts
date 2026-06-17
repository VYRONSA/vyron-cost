import { supabase } from "@/lib/supabase";
import { getIngredients, getSuppliers, CostIngredient, CostSupplier } from "@/lib/vyron-cost-core-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  branch_name?: string | null;
  po_date?: string | null;
  expected_delivery_date?: string | null;
  status?: string | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
  notes?: string | null;
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id?: string;
  ingredient_id?: string | null;
  item_name: string;
  category?: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  vat_rate: number;
  line_excl?: number;
  line_vat?: number;
  line_total?: number;
  sort_order?: number;
};

export function formatMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function calcLineExcl(qty: number, cost: number) { return Number(qty || 0) * Number(cost || 0); }
export function calcLineVat(qty: number, cost: number, vat: number) { return calcLineExcl(qty, cost) * Number(vat || 0) / 100; }
export function calcLineTotal(qty: number, cost: number, vat: number) { return calcLineExcl(qty, cost) + calcLineVat(qty, cost, vat); }

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? demoPurchaseOrders : [];

  let query = supabase.from("vyron_cost_purchase_orders").select("*").order("created_at", { ascending: false }).limit(1000);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error || !data) return useDemo ? demoPurchaseOrders : [];
  return data as PurchaseOrder[];
}
export async function getPurchaseOrderById(id: string): Promise<{ po: PurchaseOrder | null; lines: PurchaseOrderLine[] }> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return { po: null, lines: [] };
  if (!supabase || (useDemo && id.startsWith("demo"))) {
    const po = useDemo ? demoPurchaseOrders.find((item) => item.id === id) || null : null;
    const lines = po
      ? demoPurchaseOrderLines.filter((line) => line.purchase_order_id === po.id)
      : [];
    return { po, lines };
  }
  if (!companyId) return { po: null, lines: [] };
  const po = await supabase
    .from("vyron_cost_purchase_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (po.error || !po.data) return { po: null, lines: [] };
  const lines = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", id)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });
  return { po: po.data as PurchaseOrder, lines: (lines.data || []) as PurchaseOrderLine[] };
}
export async function getPurchaseOrderFormData(): Promise<{ suppliers: CostSupplier[]; ingredients: CostIngredient[] }> {
  const [suppliers, ingredients] = await Promise.all([getSuppliers(), getIngredients()]);
  return { suppliers, ingredients };
}
export const demoPurchaseOrders: PurchaseOrder[] = [{ id: "demo-po-1", po_number: "PO-0001", supplier_name: "Cape Premium Meats", branch_name: "Main", po_date: "2026-05-01", status: "Draft", subtotal: 9200, vat: 1380, total: 10580 }];
export const demoPurchaseOrderLines: PurchaseOrderLine[] = [{ id: "demo-line-1", purchase_order_id: "demo-po-1", item_name: "Beef Mince", category: "Protein", quantity: 100, unit: "kg", unit_cost: 92, vat_rate: 15, line_excl: 9200, line_vat: 1380, line_total: 10580 }];
