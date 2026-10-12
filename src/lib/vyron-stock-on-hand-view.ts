/**
 * VOLORA — Stock on Hand as at a date: the shapes, filters, totals and export table.
 *
 * Shared by the server (which builds the report) and the report screen (which filters it). No
 * server imports. The screen, its totals and the CSV / Excel / PDF export all come from these
 * functions, so an export can never disagree with what is on screen.
 *
 * Three different things are kept apart throughout:
 *   - the LEDGER BALANCE: what the recorded movements calculate (a reconstruction, not a count);
 *   - a VERIFIED COUNT: the quantity a posted physical stock count found on that date;
 *   - HISTORY UNAVAILABLE: nothing was recorded by that date, so no balance can be stated (null, never 0).
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

/**
 * The sections a report is laid out in: raw materials split into ingredients and packaging, then
 * finished goods, then anything else. Each section has its own subtotal; raw materials also total.
 */
export const STOCK_ON_HAND_SECTIONS: Array<{ key: string; group: StockOnHandGroup; label: string; matches: (l: StockOnHandLine) => boolean }> = [
  { key: "ingredients", group: "raw_materials", label: "Raw Materials — Ingredients", matches: (l) => l.group === "raw_materials" && l.entityType !== "packaging" },
  { key: "packaging", group: "raw_materials", label: "Raw Materials — Packaging", matches: (l) => l.group === "raw_materials" && l.entityType === "packaging" },
  { key: "finished_goods", group: "finished_goods", label: "Finished Goods", matches: (l) => l.group === "finished_goods" },
  { key: "other", group: "other", label: "Other Stock", matches: (l) => l.group === "other" },
];

export type StockOnHandLine = {
  stockItemId: string;
  itemCode: string;
  description: string;
  category: string;
  entityType: string;
  group: StockOnHandGroup;
  unit: string;
  isActive: boolean;
  /**
   * Ledger balance at the end of the as-at date: every movement effective before the cut-off. May be
   * negative. null when the company's ledger had not started by then — the balance cannot be stated.
   */
  qty: number | null;
  /** Weighted-average cost the ledger supports at that date; null when no movement up to then carries a cost. */
  unitCost: number | null;
  /** qty × unitCost; null when either is unavailable. Never valued at today's cost. */
  value: number | null;
  /** Movements effective on or before the as-at date. 0 = nothing recorded for this item by then. */
  movementsToDate: number;
  lastMovementDate: string | null;
  /** Quantity a posted physical stock count found for this item on the as-at date itself; null if none. */
  verifiedQty: number | null;
  /** Most recent posted physical count of this item on or before the as-at date. */
  lastCount: { date: string; countedQty: number; countNumber: string } | null;
  /** Stock Master basis: today's on hand less every movement after the date (what a stock take compares with). */
  masterQty: number;
  /** masterQty − ledger balance (null when no balance can be stated). */
  masterDifference: number | null;
  /**
   * Why the Stock Master differs, when it does. zero_floor: replaying the whole ledger as posting
   * does (flooring at zero) reproduces today's Stock Master exactly. unrecorded: it does not — the
   * Stock Master holds a quantity no ledger movement explains (e.g. stock loaded directly).
   */
  masterDifferenceCause: "zero_floor" | "unrecorded" | null;
  /** Movements effective by the date that were recorded after it (e.g. a stock take posted later). */
  recordedLater: number;
};

export type StockOnHandDisclosure = {
  kind: "history_unavailable" | "basis" | "incomplete_records" | "cost_unavailable" | "recorded_later" | "excluded_rows" | "reconciliation";
  /** critical: the figures cannot be relied on as stated; warning: some figures are affected; info: how to read them. */
  level: "critical" | "warning" | "info";
  text: string;
};

export type StockOnHandReport = {
  asAt: string;
  /** First instant after the as-at date (midnight at its end, SA time), UTC ISO. Movements before it are included. */
  cutoff: string;
  generatedAt: string;
  firstMovementDate: string | null;
  lastMovementDate: string | null;
  /** False when no movement at all is recorded on or before the as-at date: no balance can be stated. */
  historyAvailable: boolean;
  lines: StockOnHandLine[];
  reconciliation: {
    /** Σ(quantity in − quantity out) over every ledger row before the cut-off, computed straight from the rows. */
    movementQtyTotal: number;
    /** Σ line ledger balances. Equal to movementQtyTotal when the arithmetic reconciles. */
    reportQtyTotal: number;
    /** Arithmetic only: the item balances add up to the recorded movements. Says nothing about whether the ledger is complete. */
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
    /** Items a posted physical count verified on this date, and how many of those the ledger balance disagrees with. */
    itemsVerified: number;
    itemsVerifiedDiffering: number;
  };
  disclosures: StockOnHandDisclosure[];
};

export type StockOnHandFilters = { search?: string; category?: string; group?: StockOnHandGroup | "all"; hideZero?: boolean };

const isZero = (n: number | null) => n !== null && Math.abs(n) < 1e-9;

export function filterStockOnHandLines(lines: StockOnHandLine[], filters: StockOnHandFilters): StockOnHandLine[] {
  const term = String(filters.search || "").trim().toLowerCase();
  return lines.filter((l) => {
    if (filters.group && filters.group !== "all" && l.group !== filters.group) return false;
    if (filters.category && l.category !== filters.category) return false;
    // A zero balance is hidden only when it is a real zero: never an unavailable balance or a Stock Master mismatch.
    if (filters.hideZero && isZero(l.qty) && (l.masterDifference === null || isZero(l.masterDifference))) return false;
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
  /** Items whose balance cannot be stated (the ledger had not started). Excluded from every value. */
  historyUnavailable: number;
  /** Value of positive ledger balances that have a cost. */
  positiveValue: number;
  /** Value of negative ledger balances that have a cost (a negative number). */
  negativeValue: number;
  /** positiveValue + negativeValue. */
  netValue: number;
  /** Items with a non-zero balance and no cost by the date: not valued. */
  unvalued: number;
  /** Items a posted physical count verified on this date. */
  verified: number;
};

/** Totals for a set of lines. Quantities are not summed across items: their units differ. */
export function stockOnHandTotals(lines: StockOnHandLine[]): StockOnHandTotals {
  const valued = lines.filter((l) => l.value !== null && l.qty !== null);
  const positiveValue = r2(valued.filter((l) => (l.qty as number) > 0).reduce((t, l) => t + (l.value as number), 0));
  const negativeValue = r2(valued.filter((l) => (l.qty as number) < 0).reduce((t, l) => t + (l.value as number), 0));
  return {
    items: lines.length,
    withStock: lines.filter((l) => l.qty !== null && l.qty > 0).length,
    zero: lines.filter((l) => l.qty === 0).length,
    negative: lines.filter((l) => l.qty !== null && l.qty < 0).length,
    historyUnavailable: lines.filter((l) => l.qty === null).length,
    positiveValue,
    negativeValue,
    netValue: r2(positiveValue + negativeValue),
    unvalued: lines.filter((l) => l.qty !== null && l.qty !== 0 && l.value === null).length,
    verified: lines.filter((l) => l.verifiedQty !== null).length,
  };
}

/** What a line's notes column says. Empty for an ordinary, fully supported balance. */
export function stockOnHandLineNotes(l: StockOnHandLine): string[] {
  const notes: string[] = [];
  if (l.qty === null) notes.push("History unavailable — no ledger records by this date");
  else if (l.movementsToDate === 0) notes.push("No movements recorded for this item by this date");
  if (l.qty !== null && l.qty < 0) notes.push("Negative ledger balance — records incomplete or inconsistent; not proof of negative physical stock");
  if (l.qty !== null && l.qty !== 0 && l.value === null) notes.push("Historical cost unavailable — not valued");
  if (l.verifiedQty !== null && l.qty !== null && Math.abs(l.verifiedQty - l.qty) >= 1e-6) notes.push(`Physical count on this date found ${l.verifiedQty}`);
  if (l.masterDifference !== null && Math.abs(l.masterDifference) >= 1e-6)
    notes.push(
      `Stock Master differs by ${l.masterDifference > 0 ? "+" : ""}${l.masterDifference} (${l.masterDifferenceCause === "zero_floor" ? "posting's zero floor" : "not explained by any ledger movement"})`
    );
  if (l.recordedLater > 0) notes.push(`${l.recordedLater} movement(s) recorded after this date`);
  if (!l.isActive) notes.push("Inactive item");
  return notes;
}

/** The figures that head every export (all formats render the summary): the date, the basis and the totals. */
export function stockOnHandSummary(report: StockOnHandReport, lines: StockOnHandLine[]): Array<{ label: string; value: string }> {
  const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totals = stockOnHandTotals(lines);
  const head = [
    { label: "As At", value: `End of ${report.asAt} (South African time)` },
    { label: "Basis", value: "Ledger balance reconstructed from recorded stock movements — not a physical count" },
  ];
  if (!report.historyAvailable) return [...head, { label: "Stock Value", value: "Not established — no ledger history by this date" }];
  return [
    ...head,
    ...STOCK_ON_HAND_SECTIONS.map((s) => ({ s, t: stockOnHandTotals(lines.filter(s.matches)) }))
      .filter(({ t }) => t.items > 0)
      .map(({ s, t }) => ({ label: `${s.label} (Net Ledger Value)`, value: money(t.netValue) })),
    { label: "Combined Net Ledger Value", value: money(totals.netValue) },
    { label: "Positive Balances Value", value: money(totals.positiveValue) },
    { label: "Negative Balances Value", value: money(totals.negativeValue) },
    { label: "Items / Negative / Not Valued / Verified By Count", value: `${totals.items} / ${totals.negative} / ${totals.unvalued} / ${totals.verified}` },
  ];
}

const plain = (n: number, digits: number) => (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
const qtyText = (n: number) => String(Math.round(n * 1e6) / 1e6 || 0);

/**
 * The export table: one row per line, by section (raw materials — ingredients, raw materials —
 * packaging, finished goods, other), each section followed by its total, a raw materials total, then
 * the combined total. Numbers are plain (no currency symbol or thousands separator) so the CSV and
 * Excel files calculate.
 */
export function stockOnHandExportTable(lines: StockOnHandLine[]) {
  const columns = [
    { key: "group", label: "Section" },
    { key: "item_code", label: "Item Code / SKU" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit" },
    { key: "qty", label: "Ledger Balance (Reconstructed)" },
    { key: "verified", label: "Verified Physical Count (This Date)" },
    { key: "unit_cost", label: "Unit Cost" },
    { key: "value", label: "Ledger Value" },
    { key: "last_count", label: "Last Physical Count" },
    { key: "notes", label: "Notes" },
  ];
  const rows: string[][] = [];
  const totalsRow = (label: string, t: StockOnHandTotals) => [
    label,
    "",
    `${t.items} item(s); ${t.negative} negative; ${t.unvalued} not valued${t.historyUnavailable ? `; ${t.historyUnavailable} history unavailable` : ""}`,
    "",
    "",
    "",
    "",
    "",
    t.historyUnavailable === t.items && t.items > 0 ? "Not established" : plain(t.netValue, 2),
    "",
    `Positive ${plain(t.positiveValue, 2)}; negative ${plain(t.negativeValue, 2)}`,
  ];
  for (const s of STOCK_ON_HAND_SECTIONS) {
    const sectionLines = lines.filter(s.matches);
    if (sectionLines.length) {
      for (const l of sectionLines) rows.push(exportLine(s.label, l));
      rows.push(totalsRow(`${s.label} total`, stockOnHandTotals(sectionLines)));
    }
    // After the last raw materials section, the raw materials total.
    if (s.key === "packaging") {
      const raw = lines.filter((l) => l.group === "raw_materials");
      if (raw.length) rows.push(totalsRow("Raw Materials total", stockOnHandTotals(raw)));
    }
  }
  const all = stockOnHandTotals(lines);
  rows.push(totalsRow("Combined total", all));
  return { columns, rows, totals: all };
}

function exportLine(section: string, l: StockOnHandLine): string[] {
  return [
    section,
    l.itemCode,
    l.description,
    l.category,
    l.unit,
    l.qty === null ? "History unavailable" : qtyText(l.qty),
    l.verifiedQty === null ? "" : qtyText(l.verifiedQty),
    l.unitCost === null ? "Not available" : plain(l.unitCost, 4),
    l.qty === null ? "History unavailable" : l.value === null ? "Not available" : plain(l.value, 2),
    l.lastCount ? `${l.lastCount.date}: ${qtyText(l.lastCount.countedQty)} (${l.lastCount.countNumber})` : "",
    stockOnHandLineNotes(l).join("; "),
  ];
}
