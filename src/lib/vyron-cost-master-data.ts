import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostIngredient, CostSupplier } from "@/lib/vyron-cost-core-data";
import type { CostProduct } from "@/lib/vyron-cost-product-data";
import { calcGp, calcSuggestedPrice } from "@/lib/vyron-cost-product-data";
import { calculateTrueUnitCost } from "@/lib/vyron-cost-core-data";
import {
  listSupplierContactsAsSuppliers,
  updateContactRoles,
  upsertVyronContact,
} from "@/lib/vyron-contact-master";

export async function listSuppliers(supabase: SupabaseClient, companyId: string) {
  const data = await listSupplierContactsAsSuppliers(supabase, companyId);
  return (data || []) as CostSupplier[];
}

export async function getSupplierById(supabase: SupabaseClient, companyId: string, supplierId: string) {
  const suppliers = await listSupplierContactsAsSuppliers(supabase, companyId);
  return ((suppliers || []).find((row) => String(row.id) === supplierId) as CostSupplier | undefined) || null;
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
  const supplier = data as CostSupplier & { xero_contact_id?: string | null };
  await upsertVyronContact(supabase, companyId, {
    contact_name: supplier.supplier_name,
    email: supplier.contact_email,
    phone: supplier.phone,
    xero_contact_id: supplier.xero_contact_id ?? null,
    is_supplier: true,
  });
  return supplier;
}

export async function updateSupplier(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string,
  input: Partial<CostSupplier>
) {
  const { data: existingSupplier } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, supplier_name, contact_email, phone, xero_contact_id")
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();

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
  const updated = data as CostSupplier & { xero_contact_id?: string | null };

  let existingContactId: string | null = null;
  const xeroContactId = String(updated.xero_contact_id || existingSupplier?.xero_contact_id || "").trim();

  if (xeroContactId) {
    const { data: byXero } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();
    existingContactId = byXero?.id ? String(byXero.id) : null;
  }

  if (!existingContactId && existingSupplier?.supplier_name) {
    const { data: byOldName } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", String(existingSupplier.supplier_name))
      .maybeSingle();
    existingContactId = byOldName?.id ? String(byOldName.id) : null;
  }

  if (!existingContactId && updated.supplier_name) {
    const { data: byNewName } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", String(updated.supplier_name))
      .maybeSingle();
    existingContactId = byNewName?.id ? String(byNewName.id) : null;
  }

  if (existingContactId) {
    await supabase
      .from("vyron_contacts")
      .update({
        contact_name: updated.supplier_name,
        email: updated.contact_email,
        phone: updated.phone,
        xero_contact_id: xeroContactId || null,
        is_supplier: true,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", existingContactId);
  } else {
    await upsertVyronContact(supabase, companyId, {
      contact_name: updated.supplier_name,
      email: updated.contact_email,
      phone: updated.phone,
      xero_contact_id: xeroContactId || null,
      is_supplier: true,
    });
  }

  return updated;
}

async function clearSupplierRoleOnContact(
  supabase: SupabaseClient,
  companyId: string,
  supplier: { supplier_name: string; xero_contact_id?: string | null }
) {
  const supplierName = String(supplier.supplier_name || "").trim();
  const xeroContactId = supplier.xero_contact_id?.trim() || null;
  if (!supplierName && !xeroContactId) return;

  let contactId: string | null = null;
  if (xeroContactId) {
    const { data } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();
    contactId = data?.id ? String(data.id) : null;
  }
  if (!contactId && supplierName) {
    const { data } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", supplierName)
      .maybeSingle();
    contactId = data?.id ? String(data.id) : null;
  }
  if (!contactId) return;

  await updateContactRoles(supabase, companyId, contactId, { is_supplier: false });
}

export async function deleteSupplier(supabase: SupabaseClient, companyId: string, supplierId: string) {
  const { data: supplier, error: fetchError } = await supabase
    .from("vyron_cost_suppliers")
    .select("supplier_name, xero_contact_id")
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!supplier) throw new Error("Supplier not found.");

  const { error } = await supabase
    .from("vyron_cost_suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  await clearSupplierRoleOnContact(supabase, companyId, supplier);
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

export async function getIngredientById(supabase: SupabaseClient, companyId: string, ingredientId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", ingredientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CostIngredient | null) || null;
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

type ProductReferenceCounts = {
  bom: number;
  salesOrder: number;
  invoice: number;
  stockMovement: number;
  productionRun: number;
};

type ProductDeleteResult =
  | { ok: true; mode: "deleted" | "archived"; references: ProductReferenceCounts }
  | {
      ok: false;
      code: "PRODUCT_REFERENCED";
      canArchive: true;
      references: ProductReferenceCounts;
      message: string;
    };

async function tableExists(supabase: SupabaseClient, tableName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.table_name);
}

function isMissingTableError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return code === "42703" || message.includes(`column`) && message.includes(column.toLowerCase());
}

function supabaseErrorMessage(error: unknown): string {
  const err = (error || {}) as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const message = String(err.message || "").trim();
  if (message) return message;
  const details = String(err.details || "").trim();
  const hint = String(err.hint || "").trim();
  const code = String(err.code || "").trim();
  const parts = [code, details, hint].filter(Boolean);
  if (parts.length) return parts.join(" | ");
  return "Database operation failed.";
}

async function countProductReferences(
  supabase: SupabaseClient,
  companyId: string,
  productId: string
): Promise<ProductReferenceCounts> {
  const refs: ProductReferenceCounts = {
    bom: 0,
    salesOrder: 0,
    invoice: 0,
    stockMovement: 0,
    productionRun: 0,
  };

  // Conservative baseline: if the product is linked to a BOM, treat it as referenced.
  const productLink = await supabase
    .from("vyron_cost_products")
    .select("linked_bom_id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!productLink.error && productLink.data?.linked_bom_id) {
    refs.bom = Math.max(refs.bom, 1);
  }

  {
    let response = await supabase
      .from("vyron_cost_recipes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("product_id", productId)
      .neq("status", "Archived");

    if (response.error && isMissingColumnError(response.error, "status")) {
      response = await supabase
        .from("vyron_cost_recipes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("product_id", productId);
    }

    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_cost_recipes")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);
    }

    if (
      response.error &&
      !isMissingTableError(response.error) &&
      !isMissingColumnError(response.error, "product_id")
    ) {
      refs.bom = Math.max(refs.bom, 0);
    } else {
      refs.bom = response.error ? refs.bom : Math.max(refs.bom, Number(response.count || 0));
    }
  }

  {
    let response = await supabase
      .from("vyron_customer_sales_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("product_id", productId);
    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_customer_sales_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);
    }
    if (
      response.error &&
      !isMissingTableError(response.error) &&
      !isMissingColumnError(response.error, "product_id")
    ) {
      refs.salesOrder = Math.max(refs.salesOrder, 0);
    } else {
      refs.salesOrder = response.error ? 0 : Number(response.count || 0);
    }
  }

  {
    let response = await supabase
      .from("vyron_customer_invoice_lines")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("product_id", productId);
    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_customer_invoice_lines")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);
    }
    if (
      response.error &&
      !isMissingTableError(response.error) &&
      !isMissingColumnError(response.error, "product_id")
    ) {
      refs.invoice = Math.max(refs.invoice, 0);
    } else {
      refs.invoice = response.error ? 0 : Number(response.count || 0);
    }
  }

  {
    let response = await supabase
      .from("vyron_cost_production_runs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("product_id", productId);
    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_cost_production_runs")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);
    }
    if (
      response.error &&
      !isMissingTableError(response.error) &&
      !isMissingColumnError(response.error, "product_id")
    ) {
      refs.productionRun = Math.max(refs.productionRun, 0);
    } else {
      refs.productionRun = response.error ? 0 : Number(response.count || 0);
    }
  }

  const stockItemIds: string[] = [];
  {
    let response = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", productId);
    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_cost_stock_items")
        .select("id")
        .eq("entity_type", "finished_goods")
        .eq("entity_id", productId);
    }
    if (response.error && !isMissingTableError(response.error)) {
      refs.stockMovement = Math.max(refs.stockMovement, 0);
    } else {
      for (const row of response.data || []) {
        stockItemIds.push(String(row.id));
      }
    }
  }

  let stockMovements = 0;
  if (stockItemIds.length) {
    let response = await supabase
      .from("vyron_cost_stock_ledger")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("stock_item_id", stockItemIds);
    if (response.error && isMissingColumnError(response.error, "company_id")) {
      response = await supabase
        .from("vyron_cost_stock_ledger")
        .select("id", { count: "exact", head: true })
        .in("stock_item_id", stockItemIds);
    }
    if (response.error && !isMissingTableError(response.error)) {
      stockMovements += 0;
    } else {
      stockMovements += response.error ? 0 : Number(response.count || 0);
    }
  }

  {
    const candidateIds = [productId];
    let legacyResponse = await supabase
      .from("vyron_finished_goods")
      .select("id")
      .eq("company_id", companyId)
      .eq("product_id", productId);
    if (legacyResponse.error && isMissingColumnError(legacyResponse.error, "company_id")) {
      legacyResponse = await supabase
        .from("vyron_finished_goods")
        .select("id")
        .eq("product_id", productId);
    }
    if (
      legacyResponse.error &&
      !isMissingTableError(legacyResponse.error) &&
      !isMissingColumnError(legacyResponse.error, "product_id")
    ) {
      stockMovements += 0;
    } else {
      for (const row of legacyResponse.data || []) {
        candidateIds.push(String(row.id));
      }
    }

    let movementResponse = await supabase
      .from("vyron_stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("item_type", "finished_good")
      .in("item_id", Array.from(new Set(candidateIds)));
    if (movementResponse.error && isMissingColumnError(movementResponse.error, "company_id")) {
      movementResponse = await supabase
        .from("vyron_stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("item_type", "finished_good")
        .in("item_id", Array.from(new Set(candidateIds)));
    }
    if (movementResponse.error && isMissingColumnError(movementResponse.error, "item_type")) {
      movementResponse = await supabase
        .from("vyron_stock_movements")
        .select("id", { count: "exact", head: true })
        .in("item_id", Array.from(new Set(candidateIds)));
    }
    if (movementResponse.error && !isMissingTableError(movementResponse.error)) {
      stockMovements += 0;
    } else {
      stockMovements += movementResponse.error ? 0 : Number(movementResponse.count || 0);
    }
  }

  refs.stockMovement = stockMovements;
  return refs;
}

function hasReferences(refs: ProductReferenceCounts) {
  return refs.bom > 0 || refs.salesOrder > 0 || refs.invoice > 0 || refs.stockMovement > 0 || refs.productionRun > 0;
}

export async function createProduct(
  supabase: SupabaseClient,
  companyId: string,
  input: Partial<CostProduct> & {
    product_name: string;
    total_cost?: number;
    financial_sales_account_id?: string | null;
    financial_cost_of_sales_account_id?: string | null;
    financial_inventory_asset_account_id?: string | null;
    financial_wip_account_id?: string | null;
    financial_manufacturing_variance_account_id?: string | null;
    financial_stock_adjustment_account_id?: string | null;
    financial_freight_income_account_id?: string | null;
    financial_freight_expense_account_id?: string | null;
    financial_vat_tax_type?: string | null;
  }
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
      financial_sales_account_id: input.financial_sales_account_id || null,
      financial_cost_of_sales_account_id: input.financial_cost_of_sales_account_id || null,
      financial_inventory_asset_account_id: input.financial_inventory_asset_account_id || null,
      financial_wip_account_id: input.financial_wip_account_id || null,
      financial_manufacturing_variance_account_id: input.financial_manufacturing_variance_account_id || null,
      financial_stock_adjustment_account_id: input.financial_stock_adjustment_account_id || null,
      financial_freight_income_account_id: input.financial_freight_income_account_id || null,
      financial_freight_expense_account_id: input.financial_freight_expense_account_id || null,
      financial_vat_tax_type: input.financial_vat_tax_type || null,
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
    financial_sales_account_id?: string | null;
    financial_cost_of_sales_account_id?: string | null;
    financial_inventory_asset_account_id?: string | null;
    financial_wip_account_id?: string | null;
    financial_manufacturing_variance_account_id?: string | null;
    financial_stock_adjustment_account_id?: string | null;
    financial_freight_income_account_id?: string | null;
    financial_freight_expense_account_id?: string | null;
    financial_vat_tax_type?: string | null;
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
  if (input.financial_sales_account_id !== undefined) patch.financial_sales_account_id = input.financial_sales_account_id || null;
  if (input.financial_cost_of_sales_account_id !== undefined) patch.financial_cost_of_sales_account_id = input.financial_cost_of_sales_account_id || null;
  if (input.financial_inventory_asset_account_id !== undefined) patch.financial_inventory_asset_account_id = input.financial_inventory_asset_account_id || null;
  if (input.financial_wip_account_id !== undefined) patch.financial_wip_account_id = input.financial_wip_account_id || null;
  if (input.financial_manufacturing_variance_account_id !== undefined) patch.financial_manufacturing_variance_account_id = input.financial_manufacturing_variance_account_id || null;
  if (input.financial_stock_adjustment_account_id !== undefined) patch.financial_stock_adjustment_account_id = input.financial_stock_adjustment_account_id || null;
  if (input.financial_freight_income_account_id !== undefined) patch.financial_freight_income_account_id = input.financial_freight_income_account_id || null;
  if (input.financial_freight_expense_account_id !== undefined) patch.financial_freight_expense_account_id = input.financial_freight_expense_account_id || null;
  if (input.financial_vat_tax_type !== undefined) patch.financial_vat_tax_type = input.financial_vat_tax_type || null;

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

  let response = await supabase
    .from("vyron_cost_products")
    .update(patch)
    .eq("id", productId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (response.error && isMissingColumnError(response.error, "updated_at")) {
    const retryPatch = { ...patch };
    delete (retryPatch as { updated_at?: string }).updated_at;
    response = await supabase
      .from("vyron_cost_products")
      .update(retryPatch)
      .eq("id", productId)
      .eq("company_id", companyId)
      .select("*")
      .single();
  }

  if (response.error) throw new Error(response.error.message);
  const data = response.data;
  return data as CostProduct;
}

export async function deleteProduct(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  options?: { mode?: "delete" | "archive" }
): Promise<ProductDeleteResult> {
  let refs: ProductReferenceCounts;
  try {
    refs = await countProductReferences(supabase, companyId, productId);
  } catch (error) {
    throw new Error(`Reference check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const mode = options?.mode || "delete";

  if (mode === "delete" && hasReferences(refs)) {
    return {
      ok: false,
      code: "PRODUCT_REFERENCED",
      canArchive: true,
      references: refs,
      message:
        "Product cannot be deleted because it is referenced by operational records. Archive instead to preserve history.",
    };
  }

  if (mode === "archive") {
    let response = await supabase
      .from("vyron_cost_products")
      .update({
        product_status: "Archived",
        status: "Archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("company_id", companyId);

    if (response.error && isMissingColumnError(response.error, "updated_at")) {
      response = await supabase
        .from("vyron_cost_products")
        .update({
          product_status: "Archived",
          status: "Archived",
        })
        .eq("id", productId)
        .eq("company_id", companyId);
    }

    if (response.error) throw new Error(`Archive update failed: ${supabaseErrorMessage(response.error)}`);
    return { ok: true, mode: "archived", references: refs };
  }

  const { error: deleteError } = await supabase
    .from("vyron_cost_products")
    .delete()
    .eq("id", productId)
    .eq("company_id", companyId);
  if (deleteError) throw new Error(`Delete row failed: ${supabaseErrorMessage(deleteError)}`);

  const { error: stockCleanupError } = await supabase
    .from("vyron_cost_stock_items")
    .delete()
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .eq("entity_id", productId);
  if (
    stockCleanupError &&
    !isMissingTableError(stockCleanupError) &&
    !isMissingColumnError(stockCleanupError, "company_id") &&
    !isMissingColumnError(stockCleanupError, "entity_type") &&
    !isMissingColumnError(stockCleanupError, "entity_id")
  ) {
    throw new Error(`Stock cleanup failed: ${supabaseErrorMessage(stockCleanupError)}`);
  }

  return { ok: true, mode: "deleted", references: refs };
}
