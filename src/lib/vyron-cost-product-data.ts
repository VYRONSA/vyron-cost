import { supabase } from "@/lib/supabase";
import { BomHeader, getBoms } from "@/lib/vyron-cost-bom-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type CostProduct = {
  id: string;
  product_name: string;
  category?: string | null;
  product_category?: string | null;
  linked_bom_id?: string | null;
  selling_price?: number | null;
  total_cost?: number | null;
  target_gp?: number | null;
  calculated_gp?: number | null;
  suggested_selling_price?: number | null;
  product_status?: string | null;
};

export function formatMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calcGp(sellingPrice: number, cost: number) {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

export function calcSuggestedPrice(cost: number, targetGp: number) {
  if (!targetGp || targetGp >= 100) return cost;
  return cost / (1 - targetGp / 100);
}

export async function getProducts(): Promise<CostProduct[]> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? demoProducts : [];

  let query = supabase.from("vyron_cost_products").select("*").order("product_name", { ascending: true }).limit(1000);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error || !data) return useDemo ? demoProducts : [];
  return data as CostProduct[];
}

export async function getProductById(id: string): Promise<{ product: CostProduct | null; bom: BomHeader | null; boms: BomHeader[] }> {
  const boms = await getBoms();

  const { useDemo } = await workspaceScope();
  if (!supabase || (useDemo && id.startsWith("demo"))) {
    if (!useDemo) return { product: null, bom: null, boms };
    const product = demoProducts.find((item) => item.id === id) || null;
    const bom = product ? boms.find((item) => item.id === product.linked_bom_id) || null : null;
    return { product, bom, boms };
  }

  const { companyId } = await workspaceScope();
  let query = supabase.from("vyron_cost_products").select("*").eq("id", id);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.maybeSingle();

  if (error || !data) return { product: null, bom: null, boms };

  const bom = boms.find((item) => item.id === data.linked_bom_id) || null;
  return { product: data as CostProduct, bom, boms };
}

export async function getProductFormData() {
  const [products, boms] = await Promise.all([getProducts(), getBoms()]);
  return { products, boms };
}

export const demoProducts: CostProduct[] = [
  {
    id: "demo-pepper-steak-pie",
    product_name: "Pepper Steak Pie",
    product_category: "Handcrafted Pies",
    linked_bom_id: "demo-pepper-steak-bom",
    selling_price: 45,
    total_cost: 14.85,
    target_gp: 65,
    calculated_gp: 67,
    suggested_selling_price: 42.43,
    product_status: "Active",
  },
];
