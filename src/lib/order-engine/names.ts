import type { SupabaseClient } from "@supabase/supabase-js";
import { raiseDbError } from "@/lib/order-engine/errors";

/** Display names for ids, strictly within one company. Unknown ids are simply absent. */
export async function namesFor(
  supabase: SupabaseClient,
  companyId: string,
  ids: { customers?: Array<string | null>; products?: Array<string | null> }
): Promise<{ customers: Map<string, string>; products: Map<string, string> }> {
  const customerIds = [...new Set((ids.customers || []).filter((v): v is string => Boolean(v)))];
  const productIds = [...new Set((ids.products || []).filter((v): v is string => Boolean(v)))];
  const [c, p] = await Promise.all([
    customerIds.length ? supabase.from("vyron_customers").select("id, customer_name").eq("company_id", companyId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    productIds.length ? supabase.from("vyron_cost_products").select("id, product_name, sku").eq("company_id", companyId).in("id", productIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (c.error) raiseDbError(c.error, "Customer names failed");
  if (p.error) raiseDbError(p.error, "Product names failed");
  return {
    customers: new Map(((c.data || []) as Array<{ id: string; customer_name: string }>).map((r) => [String(r.id), String(r.customer_name || "")])),
    products: new Map(((p.data || []) as Array<{ id: string; product_name: string; sku: string | null }>).map((r) => [String(r.id), `${r.product_name}${r.sku ? ` (${r.sku})` : ""}`])),
  };
}
