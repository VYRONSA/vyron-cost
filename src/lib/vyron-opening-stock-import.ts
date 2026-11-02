import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findOrCreateStockItem,
  hasOpeningBalance,
  postOpeningStockMovement,
  postStockMovement,
  writeInventoryAudit,
} from "@/lib/vyron-inventory";
import { parseAmount } from "@/lib/vyron-upload-table";

/** A cell as sent by the screen (text) or an older client (number): text is parsed, never Number()-ed. */
function cellAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseAmount(String(value));
}

export type OpeningStockImportRow = {
  productCode?: string;
  productName: string;
  warehouse: string;
  qty: number | string;
  cost: number | string;
  value?: number | string;
  batch?: string;
  bin?: string;
  date?: string;
  notes?: string;
};

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function duplicateKey(row: OpeningStockImportRow) {
  return [
    String(row.productCode || row.productName || "").trim().toLowerCase(),
    String(row.warehouse || "").trim().toLowerCase(),
    String(row.batch || "").trim().toLowerCase(),
    String(row.bin || "").trim().toLowerCase(),
    String(row.date || "").trim(),
  ].join("::");
}

export async function importOpeningStockRows(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    fileName: string;
    rows: OpeningStockImportRow[];
    actor?: string;
  }
) {
  const actor = params.actor || "user";
  const errors: Array<{ row: number; error: string }> = [];
  const seen = new Set<string>();

  const { data: products, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, sku, total_cost")
    .eq("company_id", companyId);
  if (productError) throw new Error(productError.message);

  // Matched by product code (SKU) only. A name is not an identifier: two products can share it,
  // and it used to resolve last-one-wins. A code two products share is refused, not guessed.
  const bySku = new Map<string, NonNullable<typeof products>[number][]>();
  for (const row of products || []) {
    const sku = String(row.sku || "").trim().toLowerCase();
    if (!sku) continue;
    bySku.set(sku, [...(bySku.get(sku) || []), row]);
  }

  const validRows: Array<{
    index: number;
    input: OpeningStockImportRow;
    productId: string;
    productName: string;
    unitCost: number;
    qty: number;
    value: number;
  }> = [];

  for (let index = 0; index < params.rows.length; index += 1) {
    const input = params.rows[index];
    const rowNumber = index + 2;

    const key = duplicateKey(input);
    if (seen.has(key)) {
      errors.push({ row: rowNumber, error: "Duplicate row in import batch." });
      continue;
    }
    seen.add(key);

    const code = String(input.productCode || "").trim().toLowerCase();
    if (!code) {
      errors.push({ row: rowNumber, error: `Product code (SKU) is required${input.productName ? ` for "${input.productName}"` : ""}; products are not matched by name.` });
      continue;
    }
    const matches = bySku.get(code) || [];
    if (matches.length > 1) {
      errors.push({ row: rowNumber, error: `Product code ${input.productCode} belongs to ${matches.length} products; correct the product master first.` });
      continue;
    }
    const product = matches[0];
    if (!product) {
      errors.push({ row: rowNumber, error: `Product code not found (${input.productCode}).` });
      continue;
    }

    const parsedQty = cellAmount(input.qty);
    const parsedCost = cellAmount(input.cost);
    if (parsedQty === null) {
      errors.push({ row: rowNumber, error: `Qty "${input.qty ?? ""}" is not a readable number (use 0,125 or 0.125; 12,345 is ambiguous).` });
      continue;
    }
    if (parsedCost === null) {
      errors.push({ row: rowNumber, error: `Cost "${input.cost ?? ""}" is missing or not a readable amount; opening stock is never loaded at zero cost by accident.` });
      continue;
    }
    const qty = parsedQty;
    const cost = parsedCost;
    const warehouse = String(input.warehouse || "").trim();
    if (!warehouse) {
      errors.push({ row: rowNumber, error: "Warehouse is required." });
      continue;
    }
    if (qty <= 0) {
      errors.push({ row: rowNumber, error: "Qty must be greater than zero." });
      continue;
    }
    if (cost < 0) {
      errors.push({ row: rowNumber, error: "Cost cannot be negative." });
      continue;
    }

    const parsedValue = cellAmount(input.value);
    const value = parsedValue === null ? round4(qty * cost) : round4(parsedValue);
    if (value < 0) {
      errors.push({ row: rowNumber, error: "Value cannot be negative." });
      continue;
    }

    validRows.push({
      index: rowNumber,
      input,
      productId: String(product.id),
      productName: String(product.product_name || input.productName),
      unitCost: cost,
      qty,
      value,
    });
  }

  if (!validRows.length) {
    await supabase.from("vyron_opening_stock_import_runs").insert({
      company_id: companyId,
      file_name: params.fileName,
      status: "Failed",
      total_rows: params.rows.length,
      imported_rows: 0,
      rejected_rows: errors.length,
      error_report: errors,
      created_by: actor,
    });
    return { imported: 0, rejected: errors.length, errors };
  }

  /*
   * Loading opening stock twice doubled it (every row was posted with
   * allowDuplicate). A product that already has an opening balance is refused;
   * several rows for one product in THIS file (warehouses, batches) still load.
   */
  const alreadyOpened = new Set<string>();
  for (const productId of new Set(validRows.map((row) => row.productId))) {
    const { data: stockItem } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", productId)
      .maybeSingle();
    if (stockItem && (await hasOpeningBalance(supabase, companyId, String(stockItem.id)))) alreadyOpened.add(productId);
  }
  for (let i = validRows.length - 1; i >= 0; i -= 1) {
    if (alreadyOpened.has(validRows[i].productId)) {
      errors.push({ row: validRows[i].index, error: `Opening stock for ${validRows[i].productName} was already loaded; importing it again would double it. Use a stock take or adjustment instead.` });
      validRows.splice(i, 1);
    }
  }
  if (!validRows.length) {
    await supabase.from("vyron_opening_stock_import_runs").insert({
      company_id: companyId,
      file_name: params.fileName,
      status: "Failed",
      total_rows: params.rows.length,
      imported_rows: 0,
      rejected_rows: errors.length,
      error_report: errors,
      created_by: actor,
    });
    return { imported: 0, rejected: errors.length, errors };
  }

  const posted: Array<{ stockItemId: string; qty: number; cost: number; ref: string }> = [];

  try {
    for (const row of validRows) {
      const stockItem = await findOrCreateStockItem(supabase, companyId, {
        entityType: "finished_goods",
        entityId: row.productId,
        itemCode: `FG-${row.productId.slice(0, 8).toUpperCase()}`,
        description: row.productName,
        category: "Finished Goods",
        unit: "unit",
        currentCost: row.unitCost,
      });

      const reference = [
        String(row.input.warehouse || "").trim(),
        String(row.input.batch || "").trim(),
        String(row.input.bin || "").trim(),
      ]
        .filter(Boolean)
        .join(" | ");

      await postOpeningStockMovement(supabase, {
        companyId,
        stockItemId: stockItem.id,
        quantity: row.qty,
        unitCost: row.unitCost,
        movementDate: row.input.date || undefined,
        referenceNote: reference || "Opening stock import",
        actor,
        allowDuplicate: true,
      });

      await writeInventoryAudit(supabase, {
        companyId,
        stockItemId: stockItem.id,
        eventType: "Opening Stock Import Row",
        actor,
        detail: `Warehouse ${row.input.warehouse}: +${row.qty} @ ${row.unitCost}`,
        referenceType: "opening_stock_import",
      });

      posted.push({ stockItemId: stockItem.id, qty: row.qty, cost: row.unitCost, ref: reference });
    }
  } catch (error) {
    for (const row of posted) {
      await postStockMovement(supabase, {
        companyId,
        stockItemId: row.stockItemId,
        movementType: "Manual Correction",
        quantityOut: row.qty,
        unitCost: row.cost,
        referenceType: "opening_stock_import_rollback",
        referenceLabel: row.ref || "Rollback",
        actor,
        allowNegative: true,
      });
    }

    const message = error instanceof Error ? error.message : "Opening stock import failed.";
    errors.push({ row: 0, error: `Rollback executed: ${message}` });

    await supabase.from("vyron_opening_stock_import_runs").insert({
      company_id: companyId,
      file_name: params.fileName,
      status: "Failed",
      total_rows: params.rows.length,
      imported_rows: 0,
      rejected_rows: params.rows.length,
      error_report: errors,
      created_by: actor,
    });

    throw new Error(message);
  }

  const imported = posted.length;
  const rejected = params.rows.length - imported;

  await supabase.from("vyron_opening_stock_import_runs").insert({
    company_id: companyId,
    file_name: params.fileName,
    status: rejected > 0 ? "Partial" : "Completed",
    total_rows: params.rows.length,
    imported_rows: imported,
    rejected_rows: rejected,
    error_report: errors,
    created_by: actor,
  });

  return { imported, rejected, errors };
}
