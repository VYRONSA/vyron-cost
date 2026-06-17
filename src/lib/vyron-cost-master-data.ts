import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostIngredient, CostSupplier } from "@/lib/vyron-cost-core-data";
import type { CostProduct } from "@/lib/vyron-cost-product-data";
import { calcGp, calcSuggestedPrice } from "@/lib/vyron-cost-product-data";
import { calculateTrueUnitCost } from "@/lib/vyron-cost-core-data";

export async function listSuppliers(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("*")
    .eq("company_id", companyId)
    .order("supplier_name");
  if (error) throw new Error(error.message);
  return (data || []) as CostSupplier[];
}

export async function createSupplier(
  supabase: SupabaseClient,
  companyId: string,
  input: Partial<CostSupplier> & { supplier_name: string }
) {
  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      supplier_name: input.supplier_name.trim(),
      category: input.category || "Supplier",
      contact_email: input.contact_email || null,
      invoice_email: input.invoice_email || null,
      phone: input.phone || null,
      risk_status: input.risk_status || "Active",
      last_price_movement: Number(input.last_price_movement || 0),
      payment_terms: input.payment_terms || "30 Days",
      lead_time_days: Number(input.lead_time_days || 0),
      notes: input.notes || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostSupplier;
}

export async function updateSupplier(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string,
  input: Partial<CostSupplier>
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.supplier_name !== undefined) patch.supplier_name = input.supplier_name.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.contact_email !== undefined) patch.contact_email = input.contact_email;
  if (input.invoice_email !== undefined) patch.invoice_email = input.invoice_email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.risk_status !== undefined) patch.risk_status = input.risk_status;
  if (input.last_price_movement !== undefined) patch.last_price_movement = Number(input.last_price_movement);
  if (input.payment_terms !== undefined) patch.payment_terms = input.payment_terms;
  if (input.lead_time_days !== undefined) patch.lead_time_days = Number(input.lead_time_days);
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .update(patch)
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostSupplier;
}

export async function deleteSupplier(supabase: SupabaseClient, companyId: string, supplierId: string) {
  const { error } = await supabase
    .from("vyron_cost_suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listIngredients(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("*")
    .eq("company_id", companyId)
    .order("ingredient_name");
  if (error) throw new Error(error.message);
  return (data || []) as CostIngredient[];
}

export async function createIngredient(
  supabase: SupabaseClient,
  companyId: string,
  input: Partial<CostIngredient> & { ingredient_name: string }
) {
  const trueUnitCost = calculateTrueUnitCost(
    Number(input.purchase_cost || 0),
    Number(input.yield_percent || 100)
  );
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      ingredient_name: input.ingredient_name.trim(),
      category: input.category || "Uncategorised",
      supplier_id: input.supplier_id || null,
      purchase_unit: input.purchase_unit || "kg",
      recipe_unit: input.recipe_unit || "kg",
      purchase_cost: Number(input.purchase_cost || 0),
      previous_cost: Number(input.previous_cost || 0),
      yield_type: input.yield_type || "Standard",
      yield_percent: Number(input.yield_percent || 100),
      true_unit_cost: trueUnitCost,
      current_alert: input.current_alert || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostIngredient;
}

export async function updateIngredient(
  supabase: SupabaseClient,
  companyId: string,
  ingredientId: string,
  input: Partial<CostIngredient>
) {
  const purchaseCost = input.purchase_cost !== undefined ? Number(input.purchase_cost) : undefined;
  const yieldPercent = input.yield_percent !== undefined ? Number(input.yield_percent) : undefined;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.ingredient_name !== undefined) patch.ingredient_name = input.ingredient_name.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.supplier_id !== undefined) patch.supplier_id = input.supplier_id || null;
  if (input.purchase_unit !== undefined) patch.purchase_unit = input.purchase_unit;
  if (input.recipe_unit !== undefined) patch.recipe_unit = input.recipe_unit;
  if (purchaseCost !== undefined) patch.purchase_cost = purchaseCost;
  if (input.previous_cost !== undefined) patch.previous_cost = Number(input.previous_cost);
  if (input.yield_type !== undefined) patch.yield_type = input.yield_type;
  if (yieldPercent !== undefined) patch.yield_percent = yieldPercent;
  if (input.current_alert !== undefined) patch.current_alert = input.current_alert;
  if (purchaseCost !== undefined || yieldPercent !== undefined) {
    const { data: existing } = await supabase
      .from("vyron_cost_ingredients")
      .select("purchase_cost, yield_percent")
      .eq("id", ingredientId)
      .eq("company_id", companyId)
      .maybeSingle();
    const cost = purchaseCost ?? Number(existing?.purchase_cost || 0);
    const yieldPct = yieldPercent ?? Number(existing?.yield_percent || 100);
    patch.true_unit_cost = calculateTrueUnitCost(cost, yieldPct);
  }

  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .update(patch)
    .eq("id", ingredientId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostIngredient;
}

export async function deleteIngredient(supabase: SupabaseClient, companyId: string, ingredientId: string) {
  const { error } = await supabase
    .from("vyron_cost_ingredients")
    .delete()
    .eq("id", ingredientId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listProducts(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("*")
    .eq("company_id", companyId)
    .order("product_name");
  if (error) throw new Error(error.message);
  return (data || []) as CostProduct[];
}

export async function createProduct(
  supabase: SupabaseClient,
  companyId: string,
  input: Partial<CostProduct> & { product_name: string; total_cost?: number }
) {
  const selling = Number(input.selling_price || 0);
  const cost = Number(input.total_cost || 0);
  const target = Number(input.target_gp || 0);
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      product_name: input.product_name.trim(),
      category: input.product_category || input.category || "General",
      product_category: input.product_category || input.category || "General",
      linked_bom_id: input.linked_bom_id || null,
      selling_price: selling,
      total_cost: cost,
      target_gp: target,
      calculated_gp: calcGp(selling, cost),
      actual_gp: calcGp(selling, cost),
      suggested_selling_price: calcSuggestedPrice(cost, target),
      product_status: input.product_status || "Active",
      status: input.product_status || "Active",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostProduct;
}

export async function updateProduct(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  input: Partial<CostProduct> & {
    total_cost?: number;
    salary_cost?: number;
    packaging_cost?: number;
    overhead_cost?: number;
    wastage_percent?: number;
  }
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.product_name !== undefined) patch.product_name = input.product_name.trim();
  if (input.product_category !== undefined) {
    patch.product_category = input.product_category;
    patch.category = input.product_category;
  } else if (input.category !== undefined) {
    patch.category = input.category;
    patch.product_category = input.category;
  }
  if (input.linked_bom_id !== undefined) patch.linked_bom_id = input.linked_bom_id || null;
  if (input.selling_price !== undefined) patch.selling_price = Number(input.selling_price);
  if (input.total_cost !== undefined) patch.total_cost = Number(input.total_cost);
  if (input.target_gp !== undefined) patch.target_gp = Number(input.target_gp);
  if (input.product_status !== undefined) {
    patch.product_status = input.product_status;
    patch.status = input.product_status;
  }
  if (input.salary_cost !== undefined) patch.salary_cost = Number(input.salary_cost);
  if (input.packaging_cost !== undefined) patch.packaging_cost = Number(input.packaging_cost);
  if (input.overhead_cost !== undefined) patch.overhead_cost = Number(input.overhead_cost);
  if (input.wastage_percent !== undefined) patch.wastage_percent = Number(input.wastage_percent);
  if (input.suggested_selling_price !== undefined) {
    patch.suggested_selling_price = Number(input.suggested_selling_price);
  }

  const selling = input.selling_price !== undefined ? Number(input.selling_price) : undefined;
  const cost = input.total_cost !== undefined ? Number(input.total_cost) : undefined;
  const target = input.target_gp !== undefined ? Number(input.target_gp) : undefined;
  if (selling !== undefined || cost !== undefined || target !== undefined) {
    const { data: existing } = await supabase
      .from("vyron_cost_products")
      .select("selling_price, total_cost, target_gp")
      .eq("id", productId)
      .eq("company_id", companyId)
      .maybeSingle();
    const sell = selling ?? Number(existing?.selling_price || 0);
    const unitCost = cost ?? Number(existing?.total_cost || 0);
    const targetGp = target ?? Number(existing?.target_gp || 0);
    patch.calculated_gp = calcGp(sell, unitCost);
    patch.actual_gp = calcGp(sell, unitCost);
    patch.suggested_selling_price = calcSuggestedPrice(unitCost, targetGp);
  }

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .update(patch)
    .eq("id", productId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CostProduct;
}

export async function deleteProduct(supabase: SupabaseClient, companyId: string, productId: string) {
  const { error } = await supabase
    .from("vyron_cost_products")
    .update({
      product_status: "Archived",
      status: "Archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
