import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import type { CsvTable } from "@/lib/data-migration/csv";
import { getInventorySettings, writeInventoryAudit } from "@/lib/vyron-inventory";
import { STOCK_TAKE_TEMPLATE_COLUMNS, STOCK_TAKE_TEMPLATE_EXAMPLE, stockTakeCutoff, stockTakeDateProblem } from "@/lib/vyron-stock-take-rules";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { parseAmount, pickColumn } from "@/lib/vyron-upload-table";

/**
 * VOLORA — drag-and-drop stock take.
 *
 * Choose the Stock Take Date → upload → read → match → compare with system stock as at that date →
 * review. Nothing is posted by an upload: confirming it creates an ordinary stock count (status
 * Submitted, count_date = the Stock Take Date) that goes through the existing approve → post
 * workflow, which posts each variance as a "Stock Count Variance" movement dated on the Stock Take
 * Date. Only the items in the file are counted; items not in the file are not touched.
 *
 * Every row needs a stock identifier — stock item code, barcode, supplier / customer item code, an
 * alias, or the product SKU of a finished good. Items are never matched by name and never created.
 * A file with any row in error (unknown or ambiguous code, missing code, unreadable or negative
 * quantity, the same item counted twice, a row whose cells do not line up with the header) cannot be confirmed: nothing is written until it is fixed.
 * A row with an identifier and a blank quantity was not counted and is left out.
 */

export class StockTakeError extends Error {}

type StockItem = {
  id: string;
  item_code: string | null;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  unit: string | null;
  qty_on_hand: number;
  average_cost: number | null;
  current_cost: number | null;
  barcode: string | null;
  supplier_item_code: string | null;
  customer_item_code: string | null;
  aliases: string[] | null;
};

export type StockTakeStatus = "MATCHED" | "NOT_COUNTED" | "UNMATCHED" | "AMBIGUOUS" | "DUPLICATE_IN_FILE" | "INVALID_QUANTITY" | "MISSING_IDENTIFIER" | "INVALID_ROW";

/** Statuses that stop a file from being confirmed. */
export const STOCK_TAKE_ERROR_STATUSES: StockTakeStatus[] = ["UNMATCHED", "AMBIGUOUS", "DUPLICATE_IN_FILE", "INVALID_QUANTITY", "MISSING_IDENTIFIER", "INVALID_ROW"];

export type StockTakeLine = {
  row: number;
  status: StockTakeStatus;
  sku: string | null;
  description: string | null;
  location: string | null;
  stockItemId: string | null;
  itemName: string | null;
  unit: string | null;
  /** System stock as at the end of the Stock Take Date (current on hand less movements since). */
  systemQty: number | null;
  /** Net quantity moved after the Stock Take Date (already in current on hand). */
  laterMovementQty: number | null;
  countedQty: number | null;
  varianceQty: number | null;
  unitCost: number | null;
  varianceValue: number | null;
  note: string;
};

export type StockTakeSummary = {
  rows: number;
  itemsCounted: number;
  itemsWithVariance: number;
  positiveAdjustments: number;
  negativeAdjustments: number;
  netQuantityVariance: number;
  positiveValueVariance: number;
  negativeValueVariance: number;
  netValueVariance: number;
  unmatched: number;
  notCounted: number;
  errors: number;
  stockTakeDate: string | null;
};

/** The upload reader reads at most this many rows from an Excel sheet. */
export const STOCK_TAKE_TEMPLATE_MAX_ITEMS = 2000;

const COLUMNS = {
  sku: ["sku", "item code", "product code", "code", "stock code", "barcode", "item sku", "product sku"],
  description: ["description", "product", "product name", "item", "item name", "name"],
  counted: ["counted", "counted qty", "counted quantity", "count", "physical", "physical count", "quantity", "qty", "stock count"],
  location: ["location", "warehouse", "store", "bin"],
};
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function loadStockIndex(supabase: SupabaseClient, companyId: string) {
  const items = await readAllPages<StockItem>((from, to) =>
    supabase
      .from("vyron_cost_stock_items")
      .select("id, item_code, description, entity_type, entity_id, unit, qty_on_hand, average_cost, current_cost, barcode, supplier_item_code, customer_item_code, aliases")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, to)
  );
  const products = await readAllPages<{ id: string; sku: string | null }>((from, to) =>
    supabase.from("vyron_cost_products").select("id, sku").eq("company_id", companyId).not("sku", "is", null).order("id", { ascending: true }).range(from, to)
  );
  const skuByProduct = new Map(products.map((p) => [String(p.id), key(p.sku)]));
  const byIdentifier = new Map<string, Set<string>>();
  const add = (k: string, id: string) => {
    if (!k) return;
    if (!byIdentifier.has(k)) byIdentifier.set(k, new Set());
    byIdentifier.get(k)!.add(id);
  };
  for (const item of items) {
    for (const code of [item.item_code, item.barcode, item.supplier_item_code, item.customer_item_code, ...(item.aliases || [])]) add(key(code), item.id);
    if (item.entity_type === "finished_goods" && item.entity_id) add(skuByProduct.get(String(item.entity_id)) || "", item.id);
  }
  return { items: new Map(items.map((i) => [i.id, i])), byIdentifier };
}

/** Net quantity per stock item moved on or after the cutoff (i.e. after the Stock Take Date). */
async function movementsSince(supabase: SupabaseClient, companyId: string, cutoff: string) {
  const rows = await readAllPages<{ id: string; stock_item_id: string; quantity_in: number | null; quantity_out: number | null }>((from, to) =>
    supabase
      .from("vyron_cost_stock_ledger")
      .select("id, stock_item_id, quantity_in, quantity_out")
      .eq("company_id", companyId)
      .gte("movement_date", cutoff)
      .order("id", { ascending: true })
      .range(from, to)
  );
  const net = new Map<string, number>();
  for (const r of rows) net.set(r.stock_item_id, r6((net.get(r.stock_item_id) || 0) + Number(r.quantity_in || 0) - Number(r.quantity_out || 0)));
  return net;
}

/**
 * Read and validate an uploaded count and compare it with this company's stock as at the end of the
 * Stock Take Date. Read-only. Without a date, system stock is today's on hand.
 */
export async function previewStockTake(
  supabase: SupabaseClient,
  companyId: string,
  table: CsvTable,
  options: { stockTakeDate?: string | null } = {}
): Promise<{ lines: StockTakeLine[]; summary: StockTakeSummary }> {
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, pickColumn(table.header, names)])) as Record<keyof typeof COLUMNS, string | null>;
  if (!col.counted) throw new StockTakeError("The file has no counted quantity column (e.g. 'Counted Quantity'). Use the stock take template.");
  if (!col.sku) throw new StockTakeError("The file has no item code column (e.g. 'Item Code' or 'SKU'). Use the stock take template.");
  const stockTakeDate = options.stockTakeDate || null;
  if (stockTakeDate) {
    const problem = stockTakeDateProblem(stockTakeDate);
    if (problem) throw new StockTakeError(problem);
  }
  const index = await loadStockIndex(supabase, companyId);
  const later = stockTakeDate ? await movementsSince(supabase, companyId, stockTakeCutoff(stockTakeDate)) : new Map<string, number>();

  const lines: StockTakeLine[] = [];
  const seen = new Map<string, number>();
  // A row with fewer cells than the header is only missing trailing blanks (the Excel reader drops
  // them), which read as blank. A row with more cells has spilled — e.g. an unquoted "1,5" — and
  // then the last column holds a value; such a row is never read.
  const lastColumn = table.header[table.header.length - 1];
  const malformed = new Set((table.malformedRows || []).filter((n) => String(table.records.find((r) => r.row === n)?.values[lastColumn] ?? "").trim() !== ""));
  for (const record of table.records) {
    const v = (k: keyof typeof COLUMNS) => (col[k] ? String(record.values[col[k]!] ?? "").trim() : "");
    const sku = v("sku") || null;
    const description = v("description") || null;
    const location = v("location") || null;
    const rawCount = v("counted");
    if (!sku && !description && !rawCount) continue;
    const base = { row: record.row, sku, description, location, stockItemId: null, itemName: null, unit: null, systemQty: null, laterMovementQty: null, countedQty: null, varianceQty: null, unitCost: null, varianceValue: null };
    if (malformed.has(record.row)) {
      lines.push({ ...base, status: "INVALID_ROW", note: "This row has a different number of cells from the header (often an unquoted comma, e.g. 1,5 for 1.5), so its columns cannot be trusted." });
      continue;
    }
    if (!rawCount) {
      lines.push({ ...base, status: "NOT_COUNTED", note: "No counted quantity — not counted, stock left unchanged. Enter 0 if none is on hand." });
      continue;
    }
    const counted = parseAmount(rawCount);
    if (counted === null || counted < 0) {
      lines.push({ ...base, status: "INVALID_QUANTITY", note: `Counted quantity "${rawCount}" is not a number of zero or more.` });
      continue;
    }
    if (!sku) {
      lines.push({ ...base, countedQty: counted, status: "MISSING_IDENTIFIER", note: "No item code on this row; every counted row needs one." });
      continue;
    }
    const ids = index.byIdentifier.get(key(sku));
    if (!ids || ids.size === 0) {
      lines.push({ ...base, countedQty: counted, status: "UNMATCHED", note: `No stock item has code / SKU "${sku}".` });
      continue;
    }
    if (ids.size > 1) {
      lines.push({ ...base, countedQty: counted, status: "AMBIGUOUS", note: `${ids.size} stock items share "${sku}"; none is chosen.` });
      continue;
    }
    const item = index.items.get([...ids][0])!;
    if (seen.has(item.id)) {
      lines.push({ ...base, countedQty: counted, stockItemId: item.id, itemName: item.description, status: "DUPLICATE_IN_FILE", note: `${item.description || sku} is counted again (first on row ${seen.get(item.id)}). Count each item once.` });
      continue;
    }
    seen.set(item.id, record.row);
    const movedSince = later.get(item.id) || 0;
    const system = r6(Number(item.qty_on_hand || 0) - movedSince);
    const unitCost = Number(item.average_cost || item.current_cost || 0);
    const variance = r6(counted - system);
    lines.push({
      ...base,
      status: "MATCHED",
      stockItemId: item.id,
      itemName: item.description,
      unit: item.unit,
      systemQty: system,
      laterMovementQty: movedSince,
      countedQty: counted,
      varianceQty: variance,
      unitCost,
      varianceValue: r2(variance * unitCost),
      note: Math.abs(movedSince) >= 0.0001 ? `System stock as at ${stockTakeDate}; ${movedSince > 0 ? "+" : ""}${movedSince} moved since (on hand now ${r6(Number(item.qty_on_hand || 0))}).` : "",
    });
  }
  const counted = lines.filter((l) => l.status === "MATCHED");
  const withVar = counted.filter((l) => Math.abs(l.varianceQty || 0) >= 0.0001);
  return {
    lines,
    summary: {
      rows: lines.length,
      itemsCounted: counted.length,
      itemsWithVariance: withVar.length,
      positiveAdjustments: withVar.filter((l) => (l.varianceQty || 0) > 0).length,
      negativeAdjustments: withVar.filter((l) => (l.varianceQty || 0) < 0).length,
      netQuantityVariance: r6(counted.reduce((t, l) => t + (l.varianceQty || 0), 0)),
      positiveValueVariance: r2(counted.filter((l) => (l.varianceValue || 0) > 0).reduce((t, l) => t + (l.varianceValue || 0), 0)),
      negativeValueVariance: r2(counted.filter((l) => (l.varianceValue || 0) < 0).reduce((t, l) => t + (l.varianceValue || 0), 0)),
      netValueVariance: r2(counted.reduce((t, l) => t + (l.varianceValue || 0), 0)),
      unmatched: lines.filter((l) => l.status === "UNMATCHED" || l.status === "AMBIGUOUS").length,
      notCounted: lines.filter((l) => l.status === "NOT_COUNTED").length,
      errors: lines.filter((l) => STOCK_TAKE_ERROR_STATUSES.includes(l.status)).length,
      stockTakeDate,
    },
  };
}

/**
 * The stock take template (.xlsx): sheet 1 "Stock Take" lists this company's active stock items
 * (item code, description, unit) with blank Location and Counted Quantity columns — system stock
 * is deliberately not shown, so the count is blind. Sheet 2 "Instructions" lists the columns and an
 * example row. The upload reads the first sheet, so the completed file uploads as is.
 */
export async function buildStockTakeTemplate(supabase: SupabaseClient, companyId: string): Promise<{ buffer: Buffer; itemCount: number }> {
  const items = (
    await readAllPages<{ id: string; item_code: string | null; description: string | null; unit: string | null; is_active: boolean | null }>((from, to) =>
      supabase.from("vyron_cost_stock_items").select("id, item_code, description, unit, is_active").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
    )
  )
    .filter((i) => i.is_active !== false && String(i.item_code || "").trim())
    .sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)) || String(a.description || "").localeCompare(String(b.description || "")));
  if (items.length > STOCK_TAKE_TEMPLATE_MAX_ITEMS)
    throw new StockTakeError(`This company has ${items.length} active stock items; an uploaded sheet can hold at most ${STOCK_TAKE_TEMPLATE_MAX_ITEMS}.`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VOLORA";
  const sheet = workbook.addWorksheet("Stock Take", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: c.header === "Description" ? 42 : c.header === "Counted Quantity" ? 18 : 16 }));
  sheet.getRow(1).font = { bold: true };
  for (const item of items) sheet.addRow({ "Item Code": String(item.item_code).trim(), Description: item.description || "", Unit: item.unit || "" });
  sheet.getColumn("Item Code").numFmt = "@";
  sheet.getColumn("Counted Quantity").numFmt = "0.######";

  const help = workbook.addWorksheet("Instructions");
  help.columns = [
    { header: "Column", key: "column", width: 20 },
    { header: "Required", key: "required", width: 10 },
    { header: "What to enter", key: "help", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of STOCK_TAKE_TEMPLATE_COLUMNS) help.addRow({ column: c.header, required: c.required ? "Yes" : "No", help: c.help });
  help.addRow({});
  help.addRow({ column: "Example row" }).font = { bold: true };
  help.addRow(STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => c.header));
  help.addRow(STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => STOCK_TAKE_TEMPLATE_EXAMPLE[c.header]));
  help.addRow({});
  for (const note of [
    "Fill in the 'Stock Take' sheet only; keep its header row and the item codes as they are. Upload the completed file (Excel or CSV) on the Stock Take Upload screen.",
    "The Stock Take Date (the day you counted) is entered on the upload screen. The count is taken as at close of business on that day.",
    "Enter 0 for an item with nothing on hand. Leave Counted Quantity blank for an item you did not count — it is left unchanged.",
    "Count each item once. Rows with an unknown item code, an unreadable or negative quantity, or a repeated item stop the upload until they are fixed.",
  ])
    help.addRow({ column: note });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, itemCount: items.length };
}

/**
 * Confirm an upload: a stock count (Submitted, awaiting approval) dated on the Stock Take Date, with
 * one line per counted item. The Stock Take Date is required, the file must have no errors, and the
 * same file cannot be loaded twice. Posting happens only through approve → post.
 */
export async function createStockTakeFromUpload(
  supabase: SupabaseClient,
  companyId: string,
  input: { table: CsvTable; sha256: string; fileName: string; countDate: string | null | undefined },
  actor: string
) {
  const dateProblem = stockTakeDateProblem(input.countDate);
  if (dateProblem) throw new StockTakeError(dateProblem);
  const stockTakeDate = String(input.countDate).trim();

  const { data: existing, error: existingError } = await supabase.from("vyron_cost_stock_counts").select("id, count_number").eq("company_id", companyId).eq("source_sha256", input.sha256).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new StockTakeError(`This file was already loaded as stock count ${existing.count_number}.`);

  const preview = await previewStockTake(supabase, companyId, input.table, { stockTakeDate });
  if (preview.summary.errors) throw new StockTakeError(`${preview.summary.errors} row(s) in the file have errors. Fix them and upload the file again; nothing was recorded.`);
  const matched = preview.lines.filter((l) => l.status === "MATCHED");
  if (!matched.length) throw new StockTakeError("No row in the file has a counted quantity; nothing to count.");

  const settings = await getInventorySettings(supabase, companyId);
  const now = new Date().toISOString();
  const countNumber = `CNT-${Date.now().toString().slice(-8)}`;
  const { data: header, error } = await supabase
    .from("vyron_cost_stock_counts")
    .insert({
      company_id: companyId,
      count_number: countNumber,
      count_type: "upload",
      count_date: stockTakeDate,
      status: "Submitted",
      submitted_at: now,
      created_by: /^[0-9a-f-]{36}$/i.test(actor) ? actor : null,
      source_file_name: input.fileName.slice(0, 300),
      source_sha256: input.sha256,
      variance_value_total: preview.summary.netValueVariance,
      notes: `Uploaded stock take: ${input.fileName} — stock take date ${stockTakeDate}, uploaded ${now}; ${matched.length} item(s) counted, ${preview.summary.notCounted} row(s) left blank.`,
    })
    .select("*")
    .single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) throw new StockTakeError("This file was already loaded as a stock count.");
    throw new Error(error.message);
  }

  const rows = matched.map((l) => {
    const pct = l.systemQty ? Math.abs(((l.varianceQty || 0) / l.systemQty) * 100) : (l.varianceQty || 0) !== 0 ? 100 : 0;
    return {
      company_id: companyId,
      stock_count_id: header.id,
      stock_item_id: l.stockItemId,
      system_qty: l.systemQty,
      counted_qty: l.countedQty,
      expected_qty: l.systemQty,
      variance_qty: l.varianceQty,
      variance_pct: Math.round(pct * 100) / 100,
      variance_value: l.varianceValue,
      variance_class: pct >= settings.majorVariancePct ? "major" : "minor",
      unit_cost: l.unitCost,
    };
  });
  const { error: lineError } = await supabase.from("vyron_cost_stock_count_lines").insert(rows);
  if (lineError) {
    await supabase.from("vyron_cost_stock_counts").delete().eq("id", header.id).eq("company_id", companyId);
    throw new Error(lineError.message);
  }
  await writeInventoryAudit(supabase, {
    companyId,
    eventType: "Stock Take Uploaded",
    actor,
    detail: `${countNumber} from ${input.fileName}, stock take date ${stockTakeDate}: ${matched.length} item(s) counted, ${preview.summary.itemsWithVariance} with variance (net ${preview.summary.netValueVariance.toFixed(2)}), ${preview.summary.notCounted} row(s) left blank. Awaiting approval.`,
    referenceType: "stock_count",
    referenceId: header.id as string,
    metadata: { sourceFile: input.fileName, sha256: input.sha256, stockTakeDate, uploadedAt: now, summary: preview.summary },
  });
  return { count: header, preview };
}
