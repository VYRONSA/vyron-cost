import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import type { CsvTable } from "@/lib/data-migration/csv";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { listMinimumLevels, saveMinimumLevel } from "@/lib/vyron-stock-minimums";
import { parseAmount, pickColumn } from "@/lib/vyron-upload-table";

/**
 * VOLORA — minimum stock levels by spreadsheet, kept separately for Finished Goods and Raw Materials.
 *
 * Template → upload → preview → apply. The preview is read-only. Apply re-validates on the server
 * and refuses the whole file while any row has an error, so nothing invalid is ever half-loaded.
 * Each applied row goes through saveMinimumLevel (the same validation and audit trail as the
 * screen); an existing warning/critical level and production block are kept as they are.
 *
 * Matching is by Item Code only (trimmed, case-insensitive), against this company's stock items.
 * An unknown code, a code shared by several items, a code that belongs to the other section, a
 * repeated item, or an unreadable / negative minimum are errors. A row with no minimum is listed
 * as skipped (left unchanged), never treated as zero. No stock item is ever created here.
 */

export type MinimumKind = "finished_goods" | "raw_materials";
export const MINIMUM_KIND_LABEL: Record<MinimumKind, string> = { finished_goods: "Finished Goods", raw_materials: "Raw Materials" };

export class MinimumImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function kindOfEntity(entityType: string | null | undefined): MinimumKind | null {
  if (entityType === "finished_goods") return "finished_goods";
  if (entityType === "ingredient" || entityType === "packaging") return "raw_materials";
  return null;
}

export const MINIMUM_TEMPLATE_HEADERS = ["Item Code", "Product Description", "Unit of Measure", "Minimum Stock Level"] as const;
const COLUMNS = {
  code: ["Item Code", "item code", "code", "sku", "stock code", "product code"],
  description: ["Product Description", "description", "product", "item", "item description", "name"],
  unit: ["Unit of Measure", "unit", "uom", "unit of measure"],
  minimum: ["Minimum Stock Level", "minimum", "minimum level", "min", "min level", "minimum qty", "minimum quantity"],
};

export type MinimumIndexItem = {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  entityType: string;
  isActive: boolean;
  existing: { minimum: number; warning: number | null; critical: number | null; block: boolean } | null;
};

export type MinimumRowStatus = "NEW" | "CHANGE" | "UNCHANGED" | "SKIPPED" | "ERROR";
export type MinimumPreviewRow = {
  row: number;
  itemCode: string;
  description: string;
  unit: string;
  minimumText: string;
  minimum: number | null;
  stockItemId: string | null;
  currentMinimum: number | null;
  status: MinimumRowStatus;
  errors: string[];
  warnings: string[];
};
export type MinimumPreview = {
  kind: MinimumKind;
  rows: MinimumPreviewRow[];
  summary: Record<MinimumRowStatus, number> & { total: number; warnings: number };
  canApply: boolean;
};

const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Pure validation of an uploaded table against the company's stock items. */
export function validateMinimumUpload(input: { kind: MinimumKind; table: Pick<CsvTable, "header" | "records" | "malformedRows">; isCsv: boolean; items: MinimumIndexItem[] }): MinimumPreview {
  const { kind, table, items } = input;
  const codeCol = pickColumn(table.header, COLUMNS.code);
  const minCol = pickColumn(table.header, COLUMNS.minimum);
  if (!codeCol || !minCol)
    throw new MinimumImportError(
      `The file must have the column headings ${MINIMUM_TEMPLATE_HEADERS.map((h) => `"${h}"`).join(", ")}. Missing: ${[!codeCol ? "Item Code" : "", !minCol ? "Minimum Stock Level" : ""].filter(Boolean).join(" and ")}.`
    );
  const descCol = pickColumn(table.header, COLUMNS.description);
  const unitCol = pickColumn(table.header, COLUMNS.unit);

  const byCode = new Map<string, MinimumIndexItem[]>();
  for (const item of items) {
    const k = key(item.itemCode);
    if (!k) continue;
    byCode.set(k, [...(byCode.get(k) || []), item]);
  }
  const malformed = new Set(input.isCsv ? table.malformedRows : []);

  const rows: MinimumPreviewRow[] = table.records.map((rec) => {
    const v = rec.values;
    const itemCode = String(v[codeCol] ?? "").trim();
    const description = descCol ? String(v[descCol] ?? "").trim() : "";
    const unit = unitCol ? String(v[unitCol] ?? "").trim() : "";
    const minimumText = String(v[minCol] ?? "").trim();
    const row: MinimumPreviewRow = { row: rec.row, itemCode, description, unit, minimumText, minimum: null, stockItemId: null, currentMinimum: null, status: "ERROR", errors: [], warnings: [] };

    if (malformed.has(rec.row)) row.errors.push("Row has a different number of cells from the header (check for an unquoted comma).");
    if (!itemCode) row.errors.push("Item Code is required.");
    let match: MinimumIndexItem | null = null;
    if (itemCode) {
      const found = byCode.get(key(itemCode)) || [];
      const inKind = found.filter((i) => kindOfEntity(i.entityType) === kind);
      if (!found.length) row.errors.push(`Unknown Item Code "${itemCode}" — no stock item has this code.`);
      else if (!inKind.length) {
        const other = kindOfEntity(found[0].entityType);
        row.errors.push(`Item Code "${itemCode}" is ${other ? `a ${MINIMUM_KIND_LABEL[other].replace(/s$/, "")}` : `a ${found[0].entityType} item`} — upload it in the ${other ? MINIMUM_KIND_LABEL[other] : "correct"} section.`);
      } else if (inKind.length > 1) row.errors.push(`Item Code "${itemCode}" matches ${inKind.length} stock items — ambiguous; correct the codes in the stock master first.`);
      else match = inKind[0];
    }

    if (!minimumText) {
      if (!row.errors.length && match) {
        row.stockItemId = match.id;
        row.currentMinimum = match.existing?.minimum ?? null;
        row.status = "SKIPPED";
        row.warnings.push("No minimum entered — left unchanged.");
        return row;
      }
    } else {
      const parsed = parseAmount(minimumText);
      if (parsed === null) row.errors.push(`Minimum Stock Level "${minimumText}" is not a number.`);
      else if (parsed < 0) row.errors.push("Minimum Stock Level cannot be negative.");
      else row.minimum = Math.round(parsed * 1e4) / 1e4;
    }
    if (!minimumText && !row.errors.length) row.errors.push("Minimum Stock Level is required.");

    if (match) {
      row.stockItemId = match.id;
      row.currentMinimum = match.existing?.minimum ?? null;
      if (description && norm(description) !== norm(match.description)) row.warnings.push(`Description differs from the stock master ("${match.description}").`);
      if (unit && norm(unit) !== norm(match.unit)) row.warnings.push(`Unit "${unit}" differs from the stock master unit "${match.unit}"; the minimum is read in ${match.unit}.`);
      if (!match.isActive) row.warnings.push("Stock item is inactive.");
      if (row.minimum !== null && match.existing) {
        if (match.existing.warning !== null && match.existing.warning < row.minimum)
          row.errors.push(`Existing warning level ${match.existing.warning} is below the new minimum; change the warning level on screen first.`);
        if (match.existing.critical !== null && match.existing.critical > row.minimum)
          row.errors.push(`Existing critical level ${match.existing.critical} is above the new minimum; change the critical level on screen first.`);
      }
    }
    if (!row.errors.length && row.minimum !== null) {
      row.status = row.currentMinimum === null ? "NEW" : row.currentMinimum === row.minimum ? "UNCHANGED" : "CHANGE";
    }
    return row;
  });

  // The same stock item twice in one file: every occurrence is an error (which one is meant is not guessed).
  const seen = new Map<string, MinimumPreviewRow[]>();
  for (const r of rows) if (r.stockItemId) seen.set(r.stockItemId, [...(seen.get(r.stockItemId) || []), r]);
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      r.errors.push(`Duplicate: this item appears on rows ${group.map((g) => g.row).join(", ")}.`);
      r.status = "ERROR";
    }
  }
  for (const r of rows) if (r.errors.length) r.status = "ERROR";

  const summary = { NEW: 0, CHANGE: 0, UNCHANGED: 0, SKIPPED: 0, ERROR: 0, total: rows.length, warnings: 0 };
  for (const r of rows) {
    summary[r.status] += 1;
    if (r.warnings.length && r.status !== "SKIPPED") summary.warnings += 1;
  }
  return { kind, rows, summary, canApply: summary.ERROR === 0 && summary.NEW + summary.CHANGE > 0 };
}

export async function loadMinimumIndex(supabase: SupabaseClient, companyId: string): Promise<MinimumIndexItem[]> {
  const [items, levels] = await Promise.all([
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase.from("vyron_cost_stock_items").select("id, item_code, description, unit, entity_type, is_active").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
    ),
    listMinimumLevels(supabase, companyId),
  ]);
  const byItem = new Map(levels.filter((l) => (l.location || "") === "").map((l) => [l.stock_item_id, l]));
  return items.map((i) => {
    const l = byItem.get(String(i.id));
    return {
      id: String(i.id),
      itemCode: String(i.item_code || ""),
      description: String(i.description || ""),
      unit: String(i.unit || ""),
      entityType: String(i.entity_type || ""),
      isActive: i.is_active !== false,
      existing: l
        ? {
            minimum: Number(l.minimum_qty) || 0,
            warning: l.warning_qty === null || l.warning_qty === undefined ? null : Number(l.warning_qty),
            critical: l.critical_qty === null || l.critical_qty === undefined ? null : Number(l.critical_qty),
            block: Boolean(l.block_production),
          }
        : null,
    };
  });
}

export async function previewMinimumUpload(supabase: SupabaseClient, companyId: string, kind: MinimumKind, table: CsvTable, isCsv: boolean) {
  return validateMinimumUpload({ kind, table, isCsv, items: await loadMinimumIndex(supabase, companyId) });
}

/** Apply a clean file. Re-validated here; any error refuses the whole file. */
export async function applyMinimumUpload(supabase: SupabaseClient, companyId: string, kind: MinimumKind, table: CsvTable, isCsv: boolean, actor: string, source: string) {
  const items = await loadMinimumIndex(supabase, companyId);
  const preview = validateMinimumUpload({ kind, table, isCsv, items });
  if (preview.summary.ERROR > 0) throw new MinimumImportError(`The file has ${preview.summary.ERROR} row(s) with errors. Nothing was applied — correct the file and upload it again.`);
  if (!preview.canApply) throw new MinimumImportError("The file has no new or changed minimum levels to apply.");
  const byId = new Map(items.map((i) => [i.id, i]));
  let applied = 0;
  const failed: { row: number; itemCode: string; error: string }[] = [];
  for (const r of preview.rows) {
    if (r.status !== "NEW" && r.status !== "CHANGE") continue;
    const existing = byId.get(r.stockItemId!)?.existing;
    try {
      await saveMinimumLevel(
        supabase,
        companyId,
        { stockItemId: r.stockItemId!, minimumQty: r.minimum!, warningQty: existing?.warning ?? null, criticalQty: existing?.critical ?? null, blockProduction: existing?.block ?? false },
        actor,
        `${source}, row ${r.row}`
      );
      applied += 1;
    } catch (error) {
      failed.push({ row: r.row, itemCode: r.itemCode, error: error instanceof Error ? error.message : "Save failed." });
    }
  }
  return { preview, applied, failed };
}

/** Template (.xlsx): the section's stock items with their current minimum, plus an Instructions sheet. */
export async function buildMinimumTemplate(supabase: SupabaseClient, companyId: string, kind: MinimumKind) {
  const items = (await loadMinimumIndex(supabase, companyId))
    .filter((i) => kindOfEntity(i.entityType) === kind && i.isActive && i.itemCode.trim())
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  const wb = new ExcelJS.Workbook();
  wb.creator = "VOLORA";
  const sheet = wb.addWorksheet(`${MINIMUM_KIND_LABEL[kind]} Minimums`, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = MINIMUM_TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: h === "Product Description" ? 44 : 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const i of items)
    sheet.addRow({ "Item Code": i.itemCode.trim(), "Product Description": i.description, "Unit of Measure": i.unit, "Minimum Stock Level": i.existing ? i.existing.minimum : null });
  sheet.getColumn("Item Code").numFmt = "@";
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ header: "Instructions", key: "t", width: 120 }];
  help.getRow(1).font = { bold: true };
  for (const line of [
    `Minimum stock levels — ${MINIMUM_KIND_LABEL[kind]}. Upload this file in the ${MINIMUM_KIND_LABEL[kind]} section of Minimum Stock Levels.`,
    "Item Code (required): must match an existing stock item code exactly. Unknown codes are rejected; no item is created.",
    "Product Description and Unit of Measure are for reference; a difference from the stock master is shown as a warning.",
    "Minimum Stock Level: a number of zero or more, in the item's unit of measure. Leave blank to leave the item's minimum unchanged.",
    "Each item may appear once. Any row with an error stops the whole upload until it is corrected; download the error report from the preview.",
    "Existing warning and critical levels and the production block setting are kept.",
  ])
    help.addRow({ t: line });
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), itemCount: items.length };
}
