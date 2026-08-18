import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportEntityType } from "@/lib/vyron-import-centre";
import { findOrCreateStockItem, postStockMovement, type StockEntityType } from "@/lib/vyron-inventory";
import { loadSupplierIndex, matchSupplierInIndex, resolveSupplier } from "@/lib/vyron-supplier-resolution";

/**
 * Import outcome.
 *
 * `imported`, `skipped` and `errors` are retained unchanged so every existing
 * caller — the `/api/workspace/admin/import` route and its UIs — continues to
 * work exactly as before. The per-outcome counters are additive.
 *
 * `imported` = inserted + updated, preserving its original meaning of
 * "rows that resulted in a write".
 */
export type ImportPersistResult = {
  imported: number;
  skipped: number;
  errors: string[];
  /** Rows that created a new record. */
  inserted?: number;
  /** Rows that updated an existing record. */
  updated?: number;
  /** Rows matching an existing record where nothing needed changing. */
  duplicate?: number;
  /** Rows deliberately not processed (blank key, unsupported). */
  skippedRows?: number;
  /** Rows that raised an error. */
  failed?: number;
  /** Possible duplicates requiring a human decision. Never auto-merged. */
  review?: {
    row: number;
    name: string;
    candidates: { id: string; supplierName: string; similarity: number }[];
  }[];
};

function entityTypeFromRow(value: string): StockEntityType {
  const normalized = value.toLowerCase();
  if (normalized.includes("finish") || normalized.includes("product")) return "finished_goods";
  if (normalized.includes("pack")) return "packaging";
  return "ingredient";
}

/**
 * Supplier import with deterministic duplicate protection.
 *
 * Every row is resolved through the shared Supplier Resolution Service BEFORE
 * any write. The previous implementation inserted unconditionally, so
 * re-importing a file duplicated every supplier in it.
 *
 * Matching hierarchy is owned by `@/lib/vyron-supplier-resolution`:
 *   VAT number -> exact name -> normalised name -> fuzzy (proposal only) -> create
 *
 * No AI is involved. Tier 4 never merges automatically: a fuzzy candidate is
 * reported for human decision and the row is inserted as new, because creating
 * a duplicate is recoverable and merging two real suppliers is not.
 */
async function persistSuppliers(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportPersistResult> {
  const errors: string[] = [];
  const review: NonNullable<ImportPersistResult["review"]> = [];
  let inserted = 0;
  let updated = 0;
  let duplicate = 0;
  let skippedRows = 0;
  let failed = 0;

  const index = await loadSupplierIndex(supabase, companyId);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header line
    const name = row.supplier_name?.trim();

    if (!name) {
      errors.push(`Row ${rowNumber}: missing supplier_name`);
      skippedRows += 1;
      continue;
    }

    const input = {
      supplierName: name,
      vatNumber: row.vat_number || row.supplier_vat_number || null,
      contactEmail: row.contact_email || null,
      invoiceEmail: row.invoice_email || null,
      category: row.category || null,
      paymentTerms: row.payment_terms || row.terms || null,
      riskStatus: row.risk_status || null,
    };

    const match = matchSupplierInIndex(index, input);

    if (match.row) {
      // Existing supplier — apply only the fields the file actually supplies.
      const patch: Record<string, unknown> = {};
      if (row.category?.trim()) patch.category = row.category.trim();
      if (row.contact_email?.trim()) patch.contact_email = row.contact_email.trim();
      if (row.risk_status?.trim()) patch.risk_status = row.risk_status.trim();
      if (row.last_price_movement?.trim() && !Number.isNaN(Number(row.last_price_movement))) {
        patch.last_price_movement = Number(row.last_price_movement);
      }

      if (!Object.keys(patch).length) {
        duplicate += 1;
        continue;
      }

      const { error } = await supabase
        .from("vyron_cost_suppliers")
        .update(patch)
        .eq("id", match.row.id)
        .eq("company_id", companyId);

      if (error) {
        errors.push(`Row ${rowNumber} — ${name}: ${error.message}`);
        failed += 1;
      } else {
        updated += 1;
      }
      continue;
    }

    // No deterministic match. Record any fuzzy near-matches for human review,
    // then create — proposals never block an import and never auto-merge.
    if (match.candidates.length) {
      review.push({
        row: rowNumber,
        name,
        candidates: match.candidates.map((candidate) => ({
          id: candidate.id,
          supplierName: candidate.supplierName,
          similarity: candidate.similarity,
        })),
      });
    }

    const resolution = await resolveSupplier(supabase, companyId, input, { source: "import" }, index);

    if (resolution.outcome === "created") {
      if (row.last_price_movement?.trim() && !Number.isNaN(Number(row.last_price_movement))) {
        await supabase
          .from("vyron_cost_suppliers")
          .update({ last_price_movement: Number(row.last_price_movement) })
          .eq("id", resolution.supplierId as string)
          .eq("company_id", companyId);
      }
      inserted += 1;
    } else {
      errors.push(`Row ${rowNumber} — ${name}: ${resolution.error || "Could not create supplier."}`);
      failed += 1;
    }
  }

  return {
    imported: inserted + updated,
    skipped: duplicate + skippedRows + failed,
    errors,
    inserted,
    updated,
    duplicate,
    skippedRows,
    failed,
    review: review.length ? review : undefined,
  };
}

export async function persistImportRows(
  supabase: SupabaseClient,
  companyId: string,
  entity: ImportEntityType,
  rows: Record<string, string>[],
  actor = "Import Centre"
): Promise<ImportPersistResult> {
  if (entity === "opening-stock") {
    const result = await postOpeningStockBalances(supabase, companyId, rows, actor);
    return { imported: result.posted, skipped: result.skipped, errors: result.errors };
  }

  if (entity === "suppliers") {
    return persistSuppliers(supabase, companyId, rows);
  }

  if (entity === "ingredients") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.ingredient_name?.trim();
      if (!name) {
        errors.push("Missing ingredient_name");
        continue;
      }
      const { error } = await supabase.from("vyron_cost_ingredients").insert({
        id: randomUUID(),
        company_id: companyId,
        ingredient_name: name,
        category: row.category || "Ingredient",
        purchase_unit: row.purchase_unit || "kg",
        recipe_unit: row.recipe_unit || row.purchase_unit || "kg",
        purchase_cost: Number(row.purchase_cost || 0),
        yield_percent: Number(row.yield_percent || 100),
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "products" || entity === "finished-products") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = (row.product_name || row.item_name || "").trim();
      if (!name) {
        errors.push("Missing product_name");
        continue;
      }
      const selling = Number(row.selling_price || 0);
      const cost = Number(row.total_cost || row.unit_cost || 0);
      const targetGp = Number(row.target_gp || 0);
      const actualGp = selling > 0 ? ((selling - cost) / selling) * 100 : 0;
      const { error } = await supabase.from("vyron_cost_products").insert({
        id: randomUUID(),
        company_id: companyId,
        product_name: name,
        category: row.category || "General",
        selling_price: selling,
        total_cost: cost,
        target_gp: targetGp,
        actual_gp: actualGp,
        status: row.status || "Active",
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "customers") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = (row.customer_name || row.name || "").trim();
      if (!name) {
        errors.push("Missing customer_name");
        continue;
      }
      const payload = {
        company_id: companyId,
        customer_name: name,
        category: row.category || "Customer",
        email: row.contact_email || row.invoice_email || null,
        invoice_email: row.invoice_email || row.contact_email || null,
        phone: row.phone || null,
        terms: row.terms || "30 Days",
        vat_number: row.vat_number || null,
        status: row.status || "Active",
        active: row.status !== "Inactive",
      };

      /**
       * Re-importing the same customer master must not create a second copy.
       * A customer is identified within its company by Xero contact id when the
       * row carries one, otherwise by case-insensitive customer_name. The lookup
       * is always scoped by company_id so company isolation is preserved.
       */
      const xeroId = (row.xero_contact_id || "").trim();
      let existingId: string | null = null;

      if (xeroId) {
        const { data: byXero } = await supabase
          .from("vyron_customers")
          .select("id")
          .eq("company_id", companyId)
          .eq("xero_contact_id", xeroId)
          .maybeSingle();
        if (byXero?.id) existingId = String(byXero.id);
      }

      if (!existingId) {
        const { data: byName } = await supabase
          .from("vyron_customers")
          .select("id")
          .eq("company_id", companyId)
          .ilike("customer_name", name)
          .limit(1);
        if (byName?.length) existingId = String(byName[0].id);
      }

      const { error } = existingId
        ? await supabase.from("vyron_customers").update(payload).eq("id", existingId)
        : await supabase.from("vyron_customers").insert({ id: randomUUID(), ...payload });

      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "recipes") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.recipe_name?.trim() || row.bom_name?.trim();
      if (!name) {
        errors.push("Missing recipe_name");
        continue;
      }
      const totalCost = Number(row.total_cost || 0);
      const yieldQty = Math.max(1, Number(row.yield_qty || 1));
      const { error } = await supabase.from("vyron_cost_boms").insert({
        id: randomUUID(),
        company_id: companyId,
        bom_name: name,
        category: row.category || "General",
        yield_qty: yieldQty,
        yield_unit: row.yield_unit || "unit",
        total_cost: totalCost,
        cost_per_unit: totalCost / yieldQty,
        target_gp: Number(row.target_gp || 0),
        selling_price: Number(row.selling_price || 0),
        status: row.status || "Draft",
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "bom-lines") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const recipeName = row.recipe_name?.trim() || row.bom_name?.trim();
      const lineName = row.ingredient_name?.trim() || row.line_name?.trim();
      if (!recipeName || !lineName) {
        errors.push("Missing recipe_name or line_name");
        continue;
      }
      const { data: bom } = await supabase
        .from("vyron_cost_boms")
        .select("id")
        .eq("company_id", companyId)
        .eq("bom_name", recipeName)
        .maybeSingle();
      if (!bom?.id) {
        errors.push(`${recipeName}: BOM not found in workspace`);
        continue;
      }
      const quantity = Number(row.quantity || 0);
      const unitCost = Number(row.unit_cost || 0);
      const wastage = Number(row.wastage_percent || 0);
      const lineCost = quantity * unitCost * (1 + wastage / 100);
      const { error } = await supabase.from("vyron_cost_bom_lines").insert({
        id: randomUUID(),
        company_id: companyId,
        bom_id: bom.id,
        line_type: row.line_type || "Ingredient",
        line_name: lineName,
        quantity,
        unit: row.unit || "kg",
        unit_cost: unitCost,
        wastage_percent: wastage,
        line_cost: lineCost,
        sort_order: Number(row.sort_order || imported),
      });
      if (error) errors.push(`${recipeName}/${lineName}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "packaging") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.item_name?.trim();
      if (!name) {
        errors.push("Missing item_name");
        continue;
      }
      const { error } = await supabase.from("vyron_cost_ingredients").insert({
        id: randomUUID(),
        company_id: companyId,
        ingredient_name: name,
        category: row.category || "Packaging",
        purchase_unit: row.purchase_unit || "each",
        recipe_unit: row.purchase_unit || "each",
        purchase_cost: Number(row.purchase_cost || 0),
        yield_percent: 100,
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  throw new Error(`Import persistence not yet implemented for ${entity}.`);
}

export async function postOpeningStockBalances(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[],
  actor = "Opening Stock Import"
) {
  let posted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = row.item_name?.trim();
    const qty = Number(row.qty_on_hand || 0);
    const unitCost = Number(row.unit_cost || 0);
    if (!name || qty <= 0) {
      skipped += 1;
      errors.push(`${name || "Row"}: invalid quantity`);
      continue;
    }

    try {
      const entityType = entityTypeFromRow(row.entity_type || "ingredient");
      const stockItem = await findOrCreateStockItem(supabase, companyId, {
        entityType,
        itemCode: `OB-${name.slice(0, 12).replace(/\s+/g, "-").toUpperCase()}`,
        description: name,
        category: row.category || entityType,
        unit: row.unit || "kg",
        currentCost: unitCost,
      });

      const { postOpeningStockMovement } = await import("@/lib/vyron-inventory");
      await postOpeningStockMovement(supabase, {
        companyId,
        stockItemId: stockItem.id,
        quantity: qty,
        unitCost,
        referenceNote: row.location || row.reference || "Opening balance",
        actor,
        movementDate: row.opening_date || row.date || undefined,
      });
      posted += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`${name}: ${error instanceof Error ? error.message : "Failed"}`);
    }
  }

  return { posted, skipped, errors };
}
