import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supplier invoice management — server side, company scoped.
 *
 * vyron_cost_supplier_invoices carries no company_id column. Company scope is
 * therefore enforced through supplier_id, exactly as the import pipeline in
 * vyron-import-persist.ts already does: an invoice belongs to the company that
 * owns its supplier. Every read and write in this module goes through
 * companySupplierIds() so a caller can never reach another company's invoice.
 *
 * line_excl, line_vat and line_total on vyron_cost_supplier_invoice_lines are
 * database-generated columns ("can only be updated to DEFAULT"). They are never
 * written here — line edits set quantity / unit_cost / vat_rate and the database
 * derives the money, then the header is recalculated from those derived values.
 * Metadata-only edits leave the money alone: see recalcSupplierInvoiceTotals.
 */

export type SupplierInvoiceRow = {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  status: string | null;
  source_type: string | null;
  file_name: string | null;
  duplicate_risk: boolean | null;
  matched_po_id: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type SupplierInvoiceLineRow = {
  id: string;
  invoice_id: string;
  ingredient_id: string | null;
  purchase_order_line_id: string | null;
  item_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  expected_unit_cost: number;
  variance_percent: number;
  vat_rate: number;
  line_excl: number;
  line_vat: number;
  line_total: number;
  sort_order: number;
  created_at: string;
};

/** Statuses the supplier invoice model already uses. */
export const SUPPLIER_INVOICE_STATUSES = ["Draft", "Approved", "Posted", "Paid", "Cancelled"] as const;

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** The company scope key: every supplier owned by this company. */
export async function companySupplierIds(supabase: SupabaseClient, companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("id")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.id));
}

/**
 * Supabase turns .in("supplier_id", []) into a match-nothing filter, which is the
 * behaviour we want for a company with no suppliers — but we guard explicitly so
 * an empty scope can never widen into "all invoices".
 */
function scoped<T>(query: T, supplierIds: string[]): T {
  const q = query as unknown as { in: (col: string, vals: string[]) => T };
  return q.in("supplier_id", supplierIds.length ? supplierIds : ["00000000-0000-0000-0000-000000000000"]);
}

export async function listSupplierInvoices(supabase: SupabaseClient, companyId: string) {
  const supplierIds = await companySupplierIds(supabase, companyId);
  if (!supplierIds.length) return [] as SupplierInvoiceRow[];

  // Scoped twice on purpose: by the company recorded on the invoice, and by
  // the company's suppliers. The column is the authority; the supplier filter
  // stays so a row that somehow lacks the column can never widen the result.
  const { data, error } = await scoped(
    supabase.from("vyron_cost_supplier_invoices").select("*").eq("company_id", companyId),
    supplierIds
  )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as SupplierInvoiceRow[];
}

/** Line counts for the list view, in one query rather than N. */
export async function supplierInvoiceLineCounts(supabase: SupabaseClient, invoiceIds: string[]) {
  if (!invoiceIds.length) return {} as Record<string, number>;
  const { data, error } = await supabase
    .from("vyron_cost_supplier_invoice_lines")
    .select("invoice_id")
    .in("invoice_id", invoiceIds);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const key = String(row.invoice_id);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function getSupplierInvoice(supabase: SupabaseClient, companyId: string, id: string) {
  const supplierIds = await companySupplierIds(supabase, companyId);
  if (!supplierIds.length) return null;

  const { data: invoice, error } = await scoped(
    supabase.from("vyron_cost_supplier_invoices").select("*").eq("id", id).eq("company_id", companyId),
    supplierIds
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!invoice) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_supplier_invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order")
    .order("created_at");
  if (lineError) throw new Error(lineError.message);

  return {
    invoice: invoice as SupplierInvoiceRow,
    lines: (lines || []) as SupplierInvoiceLineRow[],
  };
}

/**
 * Derive the header figures from the lines.
 *
 * Subtotal is always taken from the lines. quantity x unit price is genuinely
 * derived, and for all 20 imported Handcrafted invoices the line sum already
 * agrees with the captured header subtotal to the cent.
 *
 * VAT is not derivable the same way. Every line the import pipeline writes
 * carries vat_rate 0, because no per-line VAT rate was captured: VAT on these
 * documents is a header figure and the split between standard-rated and
 * zero-rated items is unknown (the imported set sits near 14.8% of subtotal,
 * not a flat 15%, so the lines are genuinely mixed). Summing line_vat therefore
 * returns 0, and writing that back would restate an un-captured value as a
 * measured zero - precisely what deriveLineAmounts() in vyron-invoice-line-math
 * refuses to do: "A VAT amount that was never extracted is unknown, and must
 * not be presented as a measured zero."
 *
 * So line VAT becomes authoritative only once at least one line actually
 * carries a VAT rate. Until then the captured header VAT is preserved and the
 * total is restated on top of the recalculated subtotal.
 */
export function deriveSupplierInvoiceTotals(
  invoice: Pick<SupplierInvoiceRow, "vat">,
  lines: Pick<SupplierInvoiceLineRow, "line_excl" | "line_vat" | "vat_rate">[]
) {
  const subtotal = round2(lines.reduce((sum, line) => sum + Number(line.line_excl || 0), 0));
  const linesCarryVat = lines.some((line) => Number(line.vat_rate || 0) > 0);
  const vat = linesCarryVat
    ? round2(lines.reduce((sum, line) => sum + Number(line.line_vat || 0), 0))
    : round2(Number(invoice.vat || 0));
  return {
    subtotal,
    vat,
    total: round2(subtotal + vat),
    /** Where the VAT figure came from, so the UI can say so rather than imply it was derived. */
    vatBasis: linesCarryVat ? ("lines" as const) : ("header" as const),
  };
}

/**
 * Recalculate and persist the header from the lines.
 *
 * Deliberately NOT run on a metadata edit - renaming or restatusing an invoice
 * never moves its money. This runs when a line's money actually changes, and
 * when an operator asks for it explicitly.
 */
export async function recalcSupplierInvoiceTotals(
  supabase: SupabaseClient,
  companyId: string,
  id: string
) {
  const loaded = await getSupplierInvoice(supabase, companyId, id);
  if (!loaded) throw new Error("Invoice not found.");

  const { subtotal, vat, total } = deriveSupplierInvoiceTotals(loaded.invoice, loaded.lines);

  const { data, error } = await supabase
    .from("vyron_cost_supplier_invoices")
    .update({ subtotal, vat, total, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierInvoiceRow;
}

export type SupplierInvoiceHeaderPatch = {
  supplierId?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string | null;
  status?: string;
  notes?: string | null;
  sourceType?: string | null;
  matchedPoId?: string | null;
  duplicateRisk?: boolean;
};

export async function updateSupplierInvoice(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  patch: SupplierInvoiceHeaderPatch
) {
  const supplierIds = await companySupplierIds(supabase, companyId);
  const existing = await getSupplierInvoice(supabase, companyId, id);
  if (!existing) throw new Error("Invoice not found.");

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.supplierId !== undefined) {
    const nextSupplierId = patch.supplierId ? String(patch.supplierId) : null;
    if (!nextSupplierId) throw new Error("A supplier invoice must stay linked to a supplier.");
    // Re-pointing at another company's supplier would move the invoice out of scope.
    if (!supplierIds.includes(nextSupplierId)) {
      throw new Error("Supplier does not belong to the active company.");
    }
    const { data: supplier, error: supplierError } = await supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name")
      .eq("id", nextSupplierId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (supplierError) throw new Error(supplierError.message);
    if (!supplier) throw new Error("Supplier not found for the active company.");
    update.supplier_id = supplier.id;
    update.supplier_name = supplier.supplier_name;
  }

  if (patch.invoiceNumber !== undefined) {
    const next = String(patch.invoiceNumber).trim();
    if (!next) throw new Error("Invoice number is required.");
    update.invoice_number = next;
  }
  if (patch.invoiceDate !== undefined) update.invoice_date = patch.invoiceDate || null;
  if (patch.status !== undefined) {
    const next = String(patch.status).trim();
    if (!SUPPLIER_INVOICE_STATUSES.includes(next as (typeof SUPPLIER_INVOICE_STATUSES)[number])) {
      throw new Error(`Unsupported status "${next}".`);
    }
    update.status = next;
  }
  if (patch.notes !== undefined) update.notes = patch.notes || null;
  if (patch.sourceType !== undefined) update.source_type = patch.sourceType || null;
  if (patch.matchedPoId !== undefined) update.matched_po_id = patch.matchedPoId || null;
  if (patch.duplicateRisk !== undefined) update.duplicate_risk = Boolean(patch.duplicateRisk);

  const { error } = await supabase
    .from("vyron_cost_supplier_invoices")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Money is never taken from the caller here, and never recalculated as a side
  // effect — subtotal/vat/total move only when a line changes or an operator
  // explicitly recalculates.
  const reloaded = await getSupplierInvoice(supabase, companyId, id);
  if (!reloaded) throw new Error("Invoice not found after update.");
  return reloaded.invoice;
}

/** Header/line agreement for one invoice, for the UI to surface honestly. */
export function summariseTotals(
  invoice: SupplierInvoiceRow,
  lines: SupplierInvoiceLineRow[]
) {
  const lineExcl = round2(lines.reduce((sum, line) => sum + Number(line.line_excl || 0), 0));
  const lineVat = round2(lines.reduce((sum, line) => sum + Number(line.line_vat || 0), 0));
  const lineTotal = round2(lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0));
  const derived = deriveSupplierInvoiceTotals(invoice, lines);

  const headerSubtotal = round2(Number(invoice.subtotal || 0));
  const headerVat = round2(Number(invoice.vat || 0));
  const headerTotal = round2(Number(invoice.total || 0));

  return {
    lineExcl,
    lineVat,
    lineTotal,
    headerSubtotal,
    headerVat,
    headerTotal,
    derived,
    /** The part the lines genuinely evidence. */
    subtotalAgrees: Math.abs(headerSubtotal - lineExcl) < 0.01,
    /** The header restated on the basis above. */
    totalAgrees: Math.abs(headerTotal - derived.total) < 0.01,
    agrees:
      Math.abs(headerSubtotal - lineExcl) < 0.01 && Math.abs(headerTotal - derived.total) < 0.01,
  };
}

export type SupplierInvoiceLinePatch = {
  itemName?: string;
  category?: string | null;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  expectedUnitCost?: number;
  vatRate?: number;
  ingredientId?: string | null;
};

export async function updateSupplierInvoiceLine(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  lineId: string,
  patch: SupplierInvoiceLinePatch
) {
  const loaded = await getSupplierInvoice(supabase, companyId, invoiceId);
  if (!loaded) throw new Error("Invoice not found.");
  const line = loaded.lines.find((row) => row.id === lineId);
  if (!line) throw new Error("Line not found on this invoice.");

  const update: Record<string, unknown> = {};
  if (patch.itemName !== undefined) {
    const next = String(patch.itemName).trim();
    if (!next) throw new Error("Line description is required.");
    update.item_name = next;
  }
  if (patch.category !== undefined) update.category = patch.category || null;
  if (patch.quantity !== undefined) {
    const next = Number(patch.quantity);
    if (!Number.isFinite(next)) throw new Error("Quantity must be a number.");
    update.quantity = next;
  }
  if (patch.unit !== undefined) update.unit = String(patch.unit || "each");
  if (patch.unitCost !== undefined) {
    const next = Number(patch.unitCost);
    if (!Number.isFinite(next)) throw new Error("Unit price must be a number.");
    update.unit_cost = next;
  }
  if (patch.expectedUnitCost !== undefined) {
    const next = Number(patch.expectedUnitCost);
    if (!Number.isFinite(next)) throw new Error("Expected unit cost must be a number.");
    update.expected_unit_cost = next;
  }
  if (patch.vatRate !== undefined) {
    const next = Number(patch.vatRate);
    if (!Number.isFinite(next) || next < 0) throw new Error("VAT rate must be zero or greater.");
    update.vat_rate = next;
  }
  if (patch.ingredientId !== undefined) {
    const nextId = patch.ingredientId ? String(patch.ingredientId) : null;
    if (nextId) {
      const { data: ingredient, error: ingredientError } = await supabase
        .from("vyron_cost_ingredients")
        .select("id")
        .eq("id", nextId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (ingredientError) throw new Error(ingredientError.message);
      if (!ingredient) throw new Error("Ingredient not found for the active company.");
    }
    update.ingredient_id = nextId;
  }

  // Variance follows the same formula the import pipeline uses.
  const nextQty = update.quantity !== undefined ? Number(update.quantity) : Number(line.quantity || 0);
  const nextCost = update.unit_cost !== undefined ? Number(update.unit_cost) : Number(line.unit_cost || 0);
  const nextExpected =
    update.expected_unit_cost !== undefined
      ? Number(update.expected_unit_cost)
      : Number(line.expected_unit_cost || 0);
  update.variance_percent =
    nextExpected > 0 ? Math.round(((nextCost - nextExpected) / nextExpected) * 100 * 100) / 100 : 0;
  void nextQty;

  // line_excl / line_vat / line_total are generated — deliberately never written.
  const { error } = await supabase
    .from("vyron_cost_supplier_invoice_lines")
    .update(update)
    .eq("id", lineId)
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);

  return recalcSupplierInvoiceTotals(supabase, companyId, invoiceId);
}

export async function deleteSupplierInvoiceLine(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  lineId: string
) {
  const loaded = await getSupplierInvoice(supabase, companyId, invoiceId);
  if (!loaded) throw new Error("Invoice not found.");
  if (!loaded.lines.some((row) => row.id === lineId)) throw new Error("Line not found on this invoice.");

  const { error } = await supabase
    .from("vyron_cost_supplier_invoice_lines")
    .delete()
    .eq("id", lineId)
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);

  return recalcSupplierInvoiceTotals(supabase, companyId, invoiceId);
}

/**
 * Delete an invoice and its lines.
 *
 * Supplier invoices carry no stock or ledger postings of their own: the cost
 * updates that flow from an approved supplier document are written by
 * updateStockCostsFromApprovedInvoice() against vyron_documents, keyed on the
 * document id, not on this row. Deleting here therefore removes the invoice and
 * its lines only — the supplier, the ingredients and every other invoice are
 * untouched. A Posted invoice is refused so a posted document can never be
 * silently unwound from this screen.
 */
export async function deleteSupplierInvoice(supabase: SupabaseClient, companyId: string, id: string) {
  const loaded = await getSupplierInvoice(supabase, companyId, id);
  if (!loaded) throw new Error("Invoice not found.");
  if (String(loaded.invoice.status || "") === "Posted") {
    throw new Error("Posted supplier invoices cannot be deleted. Set the status back to Draft first.");
  }

  const { error: linesError } = await supabase
    .from("vyron_cost_supplier_invoice_lines")
    .delete()
    .eq("invoice_id", id);
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase.from("vyron_cost_supplier_invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return { ok: true, deletedLines: loaded.lines.length };
}

/** Suppliers and ingredients the edit form needs, both company scoped. */
export async function getSupplierInvoiceEditOptions(supabase: SupabaseClient, companyId: string) {
  const [{ data: suppliers, error: supplierError }, { data: ingredients, error: ingredientError }] =
    await Promise.all([
      supabase
        .from("vyron_cost_suppliers")
        .select("id, supplier_name")
        .eq("company_id", companyId)
        .order("supplier_name"),
      supabase
        .from("vyron_cost_ingredients")
        .select("id, ingredient_name, purchase_unit, category")
        .eq("company_id", companyId)
        .order("ingredient_name"),
    ]);
  if (supplierError) throw new Error(supplierError.message);
  if (ingredientError) throw new Error(ingredientError.message);
  return {
    suppliers: (suppliers || []) as Array<{ id: string; supplier_name: string }>,
    ingredients: (ingredients || []) as Array<{
      id: string;
      ingredient_name: string;
      purchase_unit: string | null;
      category: string | null;
    }>,
  };
}
