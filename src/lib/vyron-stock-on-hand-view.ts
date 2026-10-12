/**
 * VOLORA — Stock on Hand as at a date: the shapes, filters, totals and export table.
 *
 * Shared by the server (which builds the report) and the report screen (which filters it). No
 * server imports. The screen, its totals and the CSV / Excel / PDF export all come from these
 * functions, so an export can never disagree with what is on screen.
 */

export type StockOnHandGroup = "raw_materials" | "finished_goods" | "other";

export const STOCK_ON_HAND_GROUPS: Array<{ key: StockOnHandGroup; label: string }> = [
  { key: "raw_materials", label: "Raw Materials" },
  { key: "finished_goods", label: "Finished Goods" },
  { key: "other", label: "Other Stock" },
];

/** Ingredients and packaging are raw materials; finished goods are finished goods; anything else is shown as other, never dropped. */
export function stockOnHandGroup(entityType: string | null | undefined): StockOnHandGroup {
  const type = String(entityType || "").toLowerCase();
  if (type === "finished_goods") return "finished_goods";
  if (type === "ingredient" || type === "packaging") return "raw_materials";
  return "other";
}

export type StockOnHandLine = {
  stockItemId: string;
  itemCode: string;
  description: string;
  category: string;
  entityType: string;
  group: StockOnHandGroup;
  unit: string;
  isActive: boolean;
  /** Ledger quantity at the end of the as-at date: every movement effective before the cut-off. May be negative. */
  qty: number;
  /** Weighted-average cost the ledger supports at that date; null when no movement up to then carries a cost. */
  unitCost: number | null;
  /** qty × unitCost; null when the cost is not available. Never valued at today's cost. */
  value: number | null;
  /** Movements effective on or before the as-at date. 0 = nothing recorded for this item by then. */
  movementsToDate: number;
  lastMovementDate: string | null;
  /** Stock Master basis: today's on hand less every movement after the date (what a stock take compares with). */
  masterQty: number;
  /** masterQty − qty: stock the Stock Master holds that the ledger does not (posting floors the Stock Master at zero). */
  masterDifference: number;
  /** Movements effective by the date that were recorded after it (e.g. a stock take posted later). */
  recordedLater: number;
};

export type StockOnHandReport = {
  asAt: string;
  /** First instant after the as-at date (midnight at its end, SA time), UTC ISO. Movements before it are included. */
  cutoff: string;
  generatedAt: string;
  firstMovementDate: string | null;
  lastMovementDate: string | null;
  /** True when no movement at all is recorded on or before the as-at date. */
  beforeLedgerStart: boolean;
  lines: StockOnHandLine[];
  reconciliation: {
    /** Σ(quantity in − quantity out) over every ledger row before the cut-off, computed straight from the rows. */
    movementQtyTotal: number;
    /** Σ line quantities. Equal to movementQtyTotal when the report reconciles. */
    reportQtyTotal: number;
    reconciled: boolean;
    ledgerRowsToDate: number;
    ledgerRowsAfter: number;
    /** Ledger rows whose stock item is not one of this company's — excluded and counted. */
    unknownItemRows: number;
    masterQtyTotal: number;
    itemsDifferingFromMaster: number;
    /** Only when nothing has moved after the date: items whose ledger cost differs from the Stock Master's average cost. */
    costChecked: boolean;
    itemsCostDiffersFromMaster: number;
  };
  disclosures: string[];
};

export type StockOnHandFilters = { search?: string; category?: string; group?: StockOnHandGroup | "all"; hideZero?: boolean };

export function filterStockOnHandLines(lines: StockOnHandLine[], filters: StockOnHandFilters): StockOnHandLine[] {
  const term = String(filters.search || "").trim().toLowerCase();
  return lines.filter((l) => {
    if (filters.group && filters.group !== "all" && l.group !== filters.group) return false;
    if (filters.category && l.category !== filters.category) return false;
    if (filters.hideZero && Math.abs(l.qty) < 1e-9 && Math.abs(l.masterDifference) < 1e-9) return false;
    if (term && !`${l.itemCode} ${l.description} ${l.category}`.toLowerCase().includes(term)) return false;
    return true;
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type StockOnHandTotals = {
  items: number;
  withStock: number;
  zero: number;
  negative: number;
  /** Value of positive balances that have a cost. */
  positiveValue: number;
  /** Value of negative balances that have a cost (a negative number). */
  negativeValue: number;
  /** positiveValue + negativeValue. */
  netValue: number;
  /** Items with a non-zero balance and no cost by the date: not valued. */
  unvalued: number;
};

/** Totals for a set of lines. Quantities are not summed across items: their units differ. */
export function stockOnHandTotals(lines: StockOnHandLine[]): StockOnHandTotals {
  const valued = lines.filter((l) => l.value !== null);
  const positiveValue = r2(valued.filter((l) => l.qty > 0).reduce((t, l) => t + (l.value as number), 0));
  const negativeValue = r2(valued.filter((l) => l.qty < 0).reduce((t, l) => t + (l.value as number), 0));
  return {
    items: lines.length,
    withStock: lines.filter((l) => l.qty > 0).length,
    zero: lines.filter((l) => l.qty === 0).length,
    negative: lines.filter((l) => l.qty < 0).length,
    positiveValue,
    negativeValue,
    netValue: r2(positiveValue + negativeValue),
    unvalued: lines.filter((l) => l.value === null && l.qty !== 0).length,
  };
}

/** What a line's status column says. Empty for an ordinary, fully supported balance. */
export function stockOnHandLineNotes(l: StockOnHandLine): string[] {
  const notes: string[] = [];
  if (l.movementsToDate === 0) notes.push("No movements recorded by this date");
  if (l.qty < 0) notes.push("Negative balance");
  if (l.value === null && l.qty !== 0) notes.push("No cost in ledger by this date — not valued");
  if (Math.abs(l.masterDifference) >= 1e-6) notes.push(`Stock Master differs by ${l.masterDifference > 0 ? "+" : ""}${l.masterDifference}`);
  if (l.recordedLater > 0) notes.push(`${l.recordedLater} movement(s) recorded after this date`);
  if (!l.isActive) notes.push("Inactive item");
  return notes;
}

const plain = (n: number, digits: number) => (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);

/**
 * The export table: one row per line, grouped (raw materials, finished goods, other), each group
 * followed by its totals row, then the combined totals. Numbers are plain (no currency symbol or
 * thousands separator) so the CSV and Excel files calculate.
 */
export function stockOnHandExportTable(lines: StockOnHandLine[]) {
  const columns = [
    { key: "group", label: "Group" },
    { key: "item_code", label: "Item Code / SKU" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "type", label: "Type" },
    { key: "unit", label: "Unit" },
    { key: "qty", label: "Qty On Hand" },
    { key: "unit_cost", label: "Unit Cost" },
    { key: "value", label: "Stock Value" },
    { key: "notes", label: "Notes" },
  ];
  const rows: string[][] = [];
  const totalsRow = (label: string, t: StockOnHandTotals) => [
    label,
    "",
    `${t.items} item(s); ${t.negative} negative; ${t.unvalued} not valued`,
    "",
    "",
    "",
    "",
    "",
    plain(t.netValue, 2),
    `Positive ${plain(t.positiveValue, 2)}; negative ${plain(t.negativeValue, 2)}`,
  ];
  for (const g of STOCK_ON_HAND_GROUPS) {
    const groupLines = lines.filter((l) => l.group === g.key);
    if (!groupLines.length) continue;
    for (const l of groupLines)
      rows.push([
        g.label,
        l.itemCode,
        l.description,
        l.category,
        l.entityType,
        l.unit,
        String(Math.round(l.qty * 1e6) / 1e6 || 0),
        l.unitCost === null ? "Not available" : plain(l.unitCost, 4),
        l.value === null ? "Not available" : plain(l.value, 2),
        stockOnHandLineNotes(l).join("; "),
      ]);
    rows.push(totalsRow(`${g.label} total`, stockOnHandTotals(groupLines)));
  }
  const all = stockOnHandTotals(lines);
  rows.push(totalsRow("Combined total", all));
  return { columns, rows, totals: all };
}
