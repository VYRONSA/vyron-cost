import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProductCostFields,
  calculateLineCost,
  type ProductCostLine,
} from "@/lib/vyron-cost-data";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";

/**
 * Server-side product cost-line writes for the finished-good BOM editors.
 *
 * These used to run in the browser with the public anon key, with company_id
 * supplied by the client — so the write was neither authenticated nor tenant
 * bound (Phase 19). Every function here resolves the product against the
 * VERIFIED company first, so a cost line can only be created, changed or
 * removed on a product the caller's own company owns, and the product's derived
 * cost is recomputed server-side from the persisted lines.
 */

export type ProductCostLineInput = {
  line_type?: string;
  line_name?: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  wastage_percent?: number;
};

type ProductRow = {
  id: string;
  product_name: string | null;
  selling_price: number | null;
  target_gp: number | null;
};

/** The product, only if it belongs to the verified company. 404 otherwise. */
async function requireProduct(supabase: SupabaseClient, companyId: string, productId: string): Promise<ProductRow> {
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, selling_price, target_gp")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new WorkspaceAccessError("Product not found.", 404);
  return data as ProductRow;
}

/** All cost lines for a product the verified company owns, matched by product_id. */
export async function listProductCostLines(
  supabase: SupabaseClient,
  companyId: string,
  productId: string
): Promise<ProductCostLine[]> {
  // Ownership check first: only lines of a product this company owns are returned.
  await requireProduct(supabase, companyId, productId);
  const { data, error } = await supabase
    .from("vyron_cost_product_cost_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ProductCostLine[];
}

/** Recompute and persist the product's derived cost fields from its persisted lines. */
async function recomputeProductCost(supabase: SupabaseClient, companyId: string, product: ProductRow): Promise<void> {
  const lines = await listProductCostLines(supabase, companyId, product.id);
  const costPrice = lines.reduce((sum, line) => sum + Number(line.line_cost || line.line_cost_imported || 0), 0);
  const derived = buildProductCostFields(Number(product.selling_price || 0), Number(product.target_gp || 0), costPrice);
  const { error } = await supabase
    .from("vyron_cost_products")
    .update({ ...derived, updated_at: new Date().toISOString() })
    .eq("id", product.id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

function lineCostOf(input: ProductCostLineInput): number {
  return calculateLineCost(Number(input.quantity || 0), Number(input.unit_cost || 0), Number(input.wastage_percent || 0));
}

export async function createProductCostLine(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  input: ProductCostLineInput
): Promise<ProductCostLine> {
  const product = await requireProduct(supabase, companyId, productId);
  const name = String(input.line_name || "").trim();
  if (!name) throw new WorkspaceAccessError("A line name is required.", 400);
  const lineCost = lineCostOf(input);
  const payload = {
    company_id: companyId,
    product_id: product.id,
    product_name: product.product_name,
    line_type: String(input.line_type || "Ingredient"),
    line_name: name,
    quantity: Number(input.quantity || 0),
    unit: String(input.unit || "unit"),
    unit_cost: Number(input.unit_cost || 0),
    wastage_percent: Number(input.wastage_percent || 0),
    line_cost: lineCost,
    line_cost_imported: lineCost,
  };
  const { data, error } = await supabase
    .from("vyron_cost_product_cost_lines")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await recomputeProductCost(supabase, companyId, product);
  return data as ProductCostLine;
}

export async function updateProductCostLine(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  lineId: string,
  input: ProductCostLineInput
): Promise<ProductCostLine> {
  const product = await requireProduct(supabase, companyId, productId);
  const { data: existing, error: readError } = await supabase
    .from("vyron_cost_product_cost_lines")
    .select("*")
    .eq("id", lineId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing || String(existing.product_id || "") !== productId) {
    throw new WorkspaceAccessError("Cost line not found.", 404);
  }
  const merged: ProductCostLineInput = {
    quantity: input.quantity ?? Number(existing.quantity || 0),
    unit_cost: input.unit_cost ?? Number(existing.unit_cost || 0),
    wastage_percent: input.wastage_percent ?? Number(existing.wastage_percent || 0),
  };
  const patch: Record<string, unknown> = { line_cost: lineCostOf(merged) };
  if (input.line_type !== undefined) patch.line_type = String(input.line_type);
  if (input.line_name !== undefined) patch.line_name = String(input.line_name).trim();
  if (input.quantity !== undefined) patch.quantity = Number(input.quantity);
  if (input.unit !== undefined) patch.unit = String(input.unit);
  if (input.unit_cost !== undefined) patch.unit_cost = Number(input.unit_cost);
  if (input.wastage_percent !== undefined) patch.wastage_percent = Number(input.wastage_percent);
  patch.line_cost_imported = patch.line_cost;
  const { data, error } = await supabase
    .from("vyron_cost_product_cost_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await recomputeProductCost(supabase, companyId, product);
  return data as ProductCostLine;
}

export async function deleteProductCostLine(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  lineId: string
): Promise<void> {
  const product = await requireProduct(supabase, companyId, productId);
  const { data: existing, error: readError } = await supabase
    .from("vyron_cost_product_cost_lines")
    .select("id, product_id")
    .eq("id", lineId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing || String(existing.product_id || "") !== productId) {
    throw new WorkspaceAccessError("Cost line not found.", 404);
  }
  const { error } = await supabase
    .from("vyron_cost_product_cost_lines")
    .delete()
    .eq("id", lineId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  await recomputeProductCost(supabase, companyId, product);
}
