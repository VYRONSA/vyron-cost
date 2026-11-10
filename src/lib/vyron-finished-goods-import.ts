import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import type { CsvTable } from "@/lib/data-migration/csv";
import { createProduct, updateProduct } from "@/lib/vyron-cost-master-data";
import { findOrCreateStockItem, writeInventoryAudit } from "@/lib/vyron-inventory";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { parseAmount, pickColumn } from "@/lib/vyron-upload-table";

/**
 * VOLORA — Finished Goods spreadsheet import, keyed by Item Code.
 *
 * Writes only to the existing product master (vyron_cost_products, Item Code = sku) and its
 * finished-goods stock item; there is no second product list. Cost is never imported (it comes
 * from the BOM and production), and stock quantities are not imported here (stock take / opening
 * stock do that).
 *
 * Row outcomes: NEW (unknown Item Code — created only when the user explicitly ticks "create new
 * products"), UPDATE (one existing product; the changed fields are listed), UNCHANGED, ERROR.
 * Errors: missing Item Code or description, the same Item Code or description twice in the file,
 * an Item Code shared by several products (ambiguous), a raw-material code, a new code whose
 * description already belongs to another product (would duplicate it), an unreadable or negative
 * price, an unknown status, or a unit that differs from the existing stock item's unit.
 * Apply re-validates on the server and refuses the whole file while any row has an error.
 */

export class FinishedGoodsImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const FG_IMPORT_HEADERS = ["Item Code", "Product Description", "Category", "Unit of Measure", "Selling Price (excl. VAT)", "Status"] as const;
const COLUMNS = {
  code: ["Item Code", "code", "sku", "product code", "stock code"],
  description: ["Product Description", "description", "product name", "product", "name"],
  category: ["Category", "product category"],
  unit: ["Unit of Measure", "unit", "uom"],
  price: ["Selling Price (excl. VAT)", "selling price", "price", "selling price excl vat", "price excl vat"],
  status: ["Status", "product status"],
};

export type FgImportProduct = { id: string; sku: string; name: string; category: string; sellingPrice: number; status: string };
export type FgImportStockItem = { id: string; itemCode: string; entityType: string; entityId: string | null; unit: string };
export type FgImportIndex = { products: FgImportProduct[]; stockItems: FgImportStockItem[] };

export type FgImportStatus = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
export type FgImportRow = {
  row: number;
  itemCode: string;
  description: string;
  category: string;
  unit: string;
  priceText: string;
  sellingPrice: number | null;
  statusText: string;
  productStatus: "Active" | "Inactive" | null;
  productId: string | null;
  changes: { field: string; from: string; to: string }[];
  status: FgImportStatus;
  errors: string[];
  warnings: string[];
};
export type FgImportPreview = {
  rows: FgImportRow[];
  summary: Record<FgImportStatus, number> & { total: number };
  canApply: boolean;
};

const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const isInactive = (s: string) => /^(inactive|archived|disabled)$/i.test(s.trim());

function parseStatus(text: string): "Active" | "Inactive" | null | "invalid" {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t === "active") return "Active";
  if (t === "inactive" || t === "archived") return "Inactive";
  return "invalid";
}

export function validateFinishedGoodsImport(input: { table: Pick<CsvTable, "header" | "records" | "malformedRows">; isCsv: boolean; index: FgImportIndex }): FgImportPreview {
  const { table, index } = input;
  const codeCol = pickColumn(table.header, COLUMNS.code);
  const descCol = pickColumn(table.header, COLUMNS.description);
  if (!codeCol || !descCol)
    throw new FinishedGoodsImportError(`The file must have the column headings "Item Code" and "Product Description" (template: ${FG_IMPORT_HEADERS.join(", ")}).`);
  const catCol = pickColumn(table.header, COLUMNS.category);
  const unitCol = pickColumn(table.header, COLUMNS.unit);
  const priceCol = pickColumn(table.header, COLUMNS.price);
  const statusCol = pickColumn(table.header, COLUMNS.status);

  const productsByCode = new Map<string, FgImportProduct[]>();
  for (const p of index.products) if (key(p.sku)) productsByCode.set(key(p.sku), [...(productsByCode.get(key(p.sku)) || []), p]);
  const productsByName = new Map<string, FgImportProduct[]>();
  for (const p of index.products) productsByName.set(norm(p.name), [...(productsByName.get(norm(p.name)) || []), p]);
  const fgStockByProduct = new Map(index.stockItems.filter((s) => s.entityType === "finished_goods" && s.entityId).map((s) => [s.entityId!, s]));
  const otherStockCodes = new Map(index.stockItems.filter((s) => s.entityType !== "finished_goods").map((s) => [key(s.itemCode), s]));
  const malformed = new Set(input.isCsv ? table.malformedRows : []);

  const rows: FgImportRow[] = table.records.map((rec) => {
    const v = rec.values;
    const cell = (col: string | null) => (col ? String(v[col] ?? "").trim() : "");
    const row: FgImportRow = {
      row: rec.row,
      itemCode: cell(codeCol),
      description: cell(descCol),
      category: cell(catCol),
      unit: cell(unitCol),
      priceText: cell(priceCol),
      sellingPrice: null,
      statusText: cell(statusCol),
      productStatus: null,
      productId: null,
      changes: [],
      status: "ERROR",
      errors: [],
      warnings: [],
    };
    if (malformed.has(rec.row)) row.errors.push("Row has a different number of cells from the header (check for an unquoted comma).");
    if (!row.itemCode) row.errors.push("Item Code is required.");
    if (!row.description) row.errors.push("Product Description is required.");
    if (row.priceText) {
      const price = parseAmount(row.priceText);
      if (price === null) row.errors.push(`Selling price "${row.priceText}" is not a number.`);
      else if (price < 0) row.errors.push("Selling price cannot be negative.");
      else row.sellingPrice = Math.round(price * 100) / 100;
    }
    const st = parseStatus(row.statusText);
    if (st === "invalid") row.errors.push(`Status "${row.statusText}" must be Active or Inactive.`);
    else row.productStatus = st;

    if (row.itemCode) {
      const matches = productsByCode.get(key(row.itemCode)) || [];
      if (matches.length > 1) row.errors.push(`Item Code "${row.itemCode}" is used by ${matches.length} products — ambiguous; correct the product master first.`);
      else if (matches.length === 1) {
        const p = matches[0];
        row.productId = p.id;
        if (row.description && norm(row.description) !== norm(p.name)) {
          const clash = (productsByName.get(norm(row.description)) || []).filter((o) => o.id !== p.id);
          if (clash.length) row.errors.push(`Description "${row.description}" already belongs to another product (${clash[0].sku || "no Item Code"}).`);
          else row.changes.push({ field: "Description", from: p.name, to: row.description });
        }
        if (row.category && norm(row.category) !== norm(p.category)) row.changes.push({ field: "Category", from: p.category, to: row.category });
        if (row.sellingPrice !== null && Math.abs(row.sellingPrice - p.sellingPrice) > 0.004)
          row.changes.push({ field: "Selling price", from: p.sellingPrice.toFixed(2), to: row.sellingPrice.toFixed(2) });
        const currentStatus = isInactive(p.status) ? "Inactive" : "Active";
        if (row.productStatus && row.productStatus !== currentStatus) row.changes.push({ field: "Status", from: currentStatus, to: row.productStatus });
        const stock = fgStockByProduct.get(p.id);
        if (row.unit && stock && norm(row.unit) !== norm(stock.unit))
          row.errors.push(`Unit "${row.unit}" differs from the stock item's unit "${stock.unit}". Units are not changed by import (it would misstate stock on hand).`);
      } else {
        const other = otherStockCodes.get(key(row.itemCode));
        if (other) row.errors.push(`Item Code "${row.itemCode}" is a raw material (${other.entityType}) stock item, not a finished good.`);
        else if (row.description) {
          const clash = productsByName.get(norm(row.description)) || [];
          if (clash.length) row.errors.push(`Unknown Item Code, but description "${row.description}" already exists as product ${clash[0].sku || "(no Item Code)"} — importing would create a duplicate product.`);
          else {
            row.warnings.push("Unknown product — not in the product master. Created only if you choose to create new products.");
            if (!row.unit) row.warnings.push("No unit given; the stock item will use \"each\".");
          }
        }
      }
    }
    if (!row.errors.length) row.status = row.productId ? (row.changes.length ? "UPDATE" : "UNCHANGED") : "NEW";
    return row;
  });

  const dup = (pick: (r: FgImportRow) => string, label: string) => {
    const groups = new Map<string, FgImportRow[]>();
    for (const r of rows) {
      const k = pick(r);
      if (k) groups.set(k, [...(groups.get(k) || []), r]);
    }
    for (const group of groups.values())
      if (group.length > 1) for (const r of group) r.errors.push(`Duplicate ${label}: also on row(s) ${group.filter((g) => g !== r).map((g) => g.row).join(", ")}.`);
  };
  dup((r) => key(r.itemCode), "Item Code");
  dup((r) => norm(r.description), "description");
  for (const r of rows) if (r.errors.length) r.status = "ERROR";

  const summary = { NEW: 0, UPDATE: 0, UNCHANGED: 0, ERROR: 0, total: rows.length };
  for (const r of rows) summary[r.status] += 1;
  return { rows, summary, canApply: summary.ERROR === 0 && summary.NEW + summary.UPDATE > 0 };
}

export async function loadFinishedGoodsImportIndex(supabase: SupabaseClient, companyId: string): Promise<FgImportIndex> {
  const [products, stock] = await Promise.all([
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase.from("vyron_cost_products").select("id, sku, product_name, category, product_category, selling_price, status, product_status").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
    ),
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase.from("vyron_cost_stock_items").select("id, item_code, entity_type, entity_id, unit").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
    ),
  ]);
  return {
    products: products
      .filter((p) => !/^deleted$/i.test(String(p.status || p.product_status || "")))
      .map((p) => ({
        id: String(p.id),
        sku: String(p.sku || ""),
        name: String(p.product_name || ""),
        category: String(p.product_category || p.category || ""),
        sellingPrice: Number(p.selling_price) || 0,
        status: String(p.product_status || p.status || "Active"),
      })),
    stockItems: stock.map((s) => ({ id: String(s.id), itemCode: String(s.item_code || ""), entityType: String(s.entity_type || ""), entityId: s.entity_id ? String(s.entity_id) : null, unit: String(s.unit || "") })),
  };
}

export async function previewFinishedGoodsImport(supabase: SupabaseClient, companyId: string, table: CsvTable, isCsv: boolean) {
  return validateFinishedGoodsImport({ table, isCsv, index: await loadFinishedGoodsImportIndex(supabase, companyId) });
}

/**
 * Apply a clean file. `createNew` must be true for unknown products to be created; otherwise NEW
 * rows are listed as not created. Updates go through updateProduct (which also renames the stock item).
 */
export async function applyFinishedGoodsImport(
  supabase: SupabaseClient,
  companyId: string,
  table: CsvTable,
  isCsv: boolean,
  opts: { createNew: boolean; canCreate: boolean; canEdit: boolean; actor: string; source: string }
) {
  const preview = validateFinishedGoodsImport({ table, isCsv, index: await loadFinishedGoodsImportIndex(supabase, companyId) });
  if (preview.summary.ERROR > 0) throw new FinishedGoodsImportError(`The file has ${preview.summary.ERROR} row(s) with errors. Nothing was imported — download the correction report, fix the file and upload it again.`);
  if (preview.summary.UPDATE > 0 && !opts.canEdit) throw new FinishedGoodsImportError("You do not have permission to edit products.", 403);
  if (preview.summary.NEW > 0 && opts.createNew && !opts.canCreate) throw new FinishedGoodsImportError("You do not have permission to create products.", 403);
  if (!preview.summary.UPDATE && !(opts.createNew && preview.summary.NEW)) throw new FinishedGoodsImportError("Nothing to import: no changed products, and creating new products was not selected.");

  let created = 0, updated = 0, notCreated = 0;
  const failed: { row: number; itemCode: string; error: string }[] = [];
  for (const r of preview.rows) {
    try {
      if (r.status === "UPDATE" && r.productId) {
        const patch: Parameters<typeof updateProduct>[3] = {};
        for (const c of r.changes) {
          if (c.field === "Description") patch.product_name = r.description;
          if (c.field === "Category") patch.product_category = r.category;
          if (c.field === "Selling price") patch.selling_price = r.sellingPrice!;
          if (c.field === "Status") patch.product_status = r.productStatus!;
        }
        await updateProduct(supabase, companyId, r.productId, patch);
        await writeInventoryAudit(supabase, {
          companyId,
          eventType: "finished_good_import_updated",
          actor: opts.actor,
          detail: `${r.itemCode}: ${r.changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join("; ")} (${opts.source}, row ${r.row})`,
          referenceType: "product",
          referenceId: r.productId,
        });
        updated += 1;
      } else if (r.status === "NEW") {
        if (!opts.createNew) {
          notCreated += 1;
          continue;
        }
        const product = await createProduct(supabase, companyId, {
          product_name: r.description,
          product_category: r.category || undefined,
          selling_price: r.sellingPrice ?? 0,
          product_status: r.productStatus || "Active",
        });
        const { error: skuError } = await supabase.from("vyron_cost_products").update({ sku: r.itemCode }).eq("id", product.id).eq("company_id", companyId);
        if (skuError) throw new Error(skuError.message);
        await findOrCreateStockItem(supabase, companyId, {
          entityType: "finished_goods",
          entityId: product.id,
          itemCode: r.itemCode,
          description: r.description,
          category: r.category || "Finished Goods",
          unit: r.unit || "each",
          currentCost: 0,
          reorderLevel: 0,
          minLevel: 0,
          maxLevel: 0,
        });
        await writeInventoryAudit(supabase, {
          companyId,
          eventType: "finished_good_import_created",
          actor: opts.actor,
          detail: `${r.itemCode} ${r.description} created (${opts.source}, row ${r.row})`,
          referenceType: "product",
          referenceId: product.id,
        });
        created += 1;
      }
    } catch (error) {
      failed.push({ row: r.row, itemCode: r.itemCode, error: error instanceof Error ? error.message : "Import failed." });
    }
  }
  return { preview, created, updated, notCreated, failed };
}

/** Template (.xlsx): existing finished goods with their current details, plus Instructions. */
export async function buildFinishedGoodsImportTemplate(supabase: SupabaseClient, companyId: string) {
  const index = await loadFinishedGoodsImportIndex(supabase, companyId);
  const unitByProduct = new Map(index.stockItems.filter((s) => s.entityType === "finished_goods" && s.entityId).map((s) => [s.entityId!, s.unit]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "VOLORA";
  const sheet = wb.addWorksheet("Finished Goods", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = FG_IMPORT_HEADERS.map((h) => ({ header: h, key: h, width: h === "Product Description" ? 44 : 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const p of index.products.filter((x) => x.sku.trim()).sort((a, b) => a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name)))
    sheet.addRow({
      "Item Code": p.sku,
      "Product Description": p.name,
      Category: p.category,
      "Unit of Measure": unitByProduct.get(p.id) || "",
      "Selling Price (excl. VAT)": p.sellingPrice,
      Status: isInactive(p.status) ? "Inactive" : "Active",
    });
  sheet.getColumn("Item Code").numFmt = "@";
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ header: "Instructions", key: "t", width: 120 }];
  help.getRow(1).font = { bold: true };
  for (const line of [
    "Finished Goods import. Required columns: Item Code and Product Description. Optional: Category, Unit of Measure, Selling Price (excl. VAT), Status (Active / Inactive).",
    "A row whose Item Code exists updates that product's description, category, selling price and status. Blank optional cells leave the value unchanged.",
    "A row with an unknown Item Code is a new product. New products are created only if you tick \"Create new products\" when applying.",
    "Cost is never imported (it comes from the BOM and production). Stock quantities are not imported here — use Stock Take or Opening Stock.",
    "Unit of Measure cannot be changed by import. Each Item Code and each description may appear once.",
    "Any row with an error stops the whole import until it is corrected. Download the correction report from the preview.",
  ])
    help.addRow({ t: line });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
