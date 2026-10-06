import type { SupabaseClient } from "@supabase/supabase-js";
import type { CsvTable } from "@/lib/data-migration/csv";
import { getInventorySettings, writeInventoryAudit } from "@/lib/vyron-inventory";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { parseAmount, pickColumn } from "@/lib/vyron-upload-table";

/**
 * VOLORA — drag-and-drop stock take.
 *
 * Upload → read → match → compare with system stock → review. Nothing is posted by an upload:
 * confirming it creates an ordinary stock count (status Submitted) that goes through the existing
 * approve → post workflow, which posts each variance as a "Stock Count Variance" movement in the
 * stock ledger. Only the items in the file are counted; items not in the file are not touched.
 *
 * Matching uses identifiers — stock item code, barcode, supplier / customer item code, aliases, or
 * the product SKU of a finished good. A row that gives an identifier VOLORA does not know is
 * reported unmatched (never matched by name instead); only a row with no identifier at all is
 * matched on its exact description, and says so. Products are never created.
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

export type StockTakeStatus = "MATCHED" | "MATCHED_BY_NAME" | "UNMATCHED" | "AMBIGUOUS" | "DUPLICATE_IN_FILE" | "INVALID_QUANTITY";

export type StockTakeLine = {
  row: number;
  status: StockTakeStatus;
  sku: string | null;
  description: string | null;
  location: string | null;
  stockItemId: string | null;
  itemName: string | null;
  unit: string | null;
  systemQty: number | null;
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
};

const COLUMNS = {
  sku: ["sku", "item code", "product code", "code", "stock code", "barcode", "item sku", "product sku"],
  description: ["description", "product", "product name", "item", "item name", "name"],
  counted: ["counted", "counted qty", "counted quantity", "count", "physical", "physical count", "quantity", "qty", "stock count"],
  location: ["location", "warehouse", "store", "bin"],
};
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const nameKey = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
  const byName = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, k: string, id: string) => {
    if (!k) return;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(id);
  };
  for (const item of items) {
    for (const code of [item.item_code, item.barcode, item.supplier_item_code, item.customer_item_code, ...(item.aliases || [])]) add(byIdentifier, key(code), item.id);
    if (item.entity_type === "finished_goods" && item.entity_id) add(byIdentifier, skuByProduct.get(String(item.entity_id)) || "", item.id);
    add(byName, nameKey(item.description), item.id);
  }
  return { items: new Map(items.map((i) => [i.id, i])), byIdentifier, byName };
}

/** Read and match an uploaded count against this company's stock. Read-only. */
export async function previewStockTake(supabase: SupabaseClient, companyId: string, table: CsvTable): Promise<{ lines: StockTakeLine[]; summary: StockTakeSummary }> {
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, pickColumn(table.header, names)])) as Record<keyof typeof COLUMNS, string | null>;
  if (!col.counted) throw new StockTakeError("The file has no counted quantity column (e.g. 'Counted', 'Quantity').");
  if (!col.sku && !col.description) throw new StockTakeError("The file has no SKU / item code or description column.");
  const index = await loadStockIndex(supabase, companyId);

  const lines: StockTakeLine[] = [];
  const seen = new Map<string, number>();
  for (const record of table.records) {
    const v = (k: keyof typeof COLUMNS) => (col[k] ? String(record.values[col[k]!] ?? "").trim() : "");
    const sku = v("sku") || null;
    const description = v("description") || null;
    const location = v("location") || null;
    if (!sku && !description && !v("counted")) continue;
    const base = { row: record.row, sku, description, location, stockItemId: null, itemName: null, unit: null, systemQty: null, countedQty: null, varianceQty: null, unitCost: null, varianceValue: null };
    const counted = parseAmount(v("counted"));
    if (counted === null || counted < 0) {
      lines.push({ ...base, status: "INVALID_QUANTITY", note: `Counted quantity "${v("counted")}" is not a number of zero or more.` });
      continue;
    }
    let ids: Set<string> | undefined;
    let byName = false;
    if (sku) ids = index.byIdentifier.get(key(sku));
    else if (description) {
      ids = index.byName.get(nameKey(description));
      byName = true;
    }
    if (!ids || ids.size === 0) {
      lines.push({ ...base, countedQty: counted, status: "UNMATCHED", note: sku ? `No stock item has code / SKU "${sku}".` : `No stock item is named "${description}".` });
      continue;
    }
    if (ids.size > 1) {
      lines.push({ ...base, countedQty: counted, status: "AMBIGUOUS", note: `${ids.size} stock items share "${sku || description}"; none is chosen.` });
      continue;
    }
    const item = index.items.get([...ids][0])!;
    if (seen.has(item.id)) {
      lines.push({ ...base, countedQty: counted, stockItemId: item.id, itemName: item.description, status: "DUPLICATE_IN_FILE", note: `Counted again (first on row ${seen.get(item.id)}); only the first count is used.` });
      continue;
    }
    seen.set(item.id, record.row);
    const system = Number(item.qty_on_hand || 0);
    const unitCost = Number(item.average_cost || item.current_cost || 0);
    const variance = r6(counted - system);
    lines.push({
      ...base,
      status: byName ? "MATCHED_BY_NAME" : "MATCHED",
      stockItemId: item.id,
      itemName: item.description,
      unit: item.unit,
      systemQty: system,
      countedQty: counted,
      varianceQty: variance,
      unitCost,
      varianceValue: r2(variance * unitCost),
      note: byName ? "Matched on its exact description (the file gives no code)." : "",
    });
  }
  const counted = lines.filter((l) => l.status === "MATCHED" || l.status === "MATCHED_BY_NAME");
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
      unmatched: lines.length - counted.length,
    },
  };
}

/**
 * Confirm an upload: a stock count (Submitted, awaiting approval) with one line per matched item.
 * The same file cannot be loaded twice. Posting happens only through approve → post.
 */
export async function createStockTakeFromUpload(
  supabase: SupabaseClient,
  companyId: string,
  input: { table: CsvTable; sha256: string; fileName: string; countDate?: string | null },
  actor: string
) {
  const { data: existing, error: existingError } = await supabase.from("vyron_cost_stock_counts").select("id, count_number").eq("company_id", companyId).eq("source_sha256", input.sha256).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new StockTakeError(`This file was already loaded as stock count ${existing.count_number}.`);

  const preview = await previewStockTake(supabase, companyId, input.table);
  const matched = preview.lines.filter((l) => l.status === "MATCHED" || l.status === "MATCHED_BY_NAME");
  if (!matched.length) throw new StockTakeError("No row in the file matched a stock item; nothing to count.");

  const settings = await getInventorySettings(supabase, companyId);
  const now = new Date().toISOString();
  const countNumber = `CNT-${Date.now().toString().slice(-8)}`;
  const { data: header, error } = await supabase
    .from("vyron_cost_stock_counts")
    .insert({
      company_id: companyId,
      count_number: countNumber,
      count_type: "upload",
      count_date: input.countDate || now.slice(0, 10),
      status: "Submitted",
      submitted_at: now,
      created_by: /^[0-9a-f-]{36}$/i.test(actor) ? actor : null,
      source_file_name: input.fileName.slice(0, 300),
      source_sha256: input.sha256,
      variance_value_total: preview.summary.netValueVariance,
      notes: `Uploaded stock take: ${input.fileName} — ${matched.length} item(s), ${preview.summary.unmatched} row(s) not matched.`,
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
    detail: `${countNumber} from ${input.fileName}: ${matched.length} item(s) counted, ${preview.summary.itemsWithVariance} with variance (net ${preview.summary.netValueVariance.toFixed(2)}), ${preview.summary.unmatched} row(s) not matched. Awaiting approval.`,
    referenceType: "stock_count",
    referenceId: header.id as string,
    metadata: { sourceFile: input.fileName, sha256: input.sha256, summary: preview.summary },
  });
  return { count: header, preview };
}
