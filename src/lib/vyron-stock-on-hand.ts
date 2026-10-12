import type { SupabaseClient } from "@supabase/supabase-js";
import { stockTakeCutoff, todayInSouthAfrica } from "@/lib/vyron-stock-take-rules";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { stockOnHandGroup, type StockOnHandLine, type StockOnHandReport } from "@/lib/vyron-stock-on-hand-view";

/**
 * VOLORA — Stock on Hand as at a date, rebuilt from the stock ledger.
 *
 * QUANTITY. The ledger (vyron_cost_stock_ledger) is the record of every stock movement, each with an
 * effective movement_date. Stock at the end of a date is the sum of quantity in − quantity out over
 * every movement effective before midnight at the end of that date, South African time — the same
 * cut-off a stock take uses. Nothing is clamped: a negative balance is shown as negative.
 *
 * COST. Stock is costed at weighted average (vyron-inventory postStockMovement): a receipt re-averages
 * the cost over the stock held, a Cost Update replaces it. Replaying that rule over the movements
 * effective by the date, in the order they were posted, gives the cost the ledger supports at that
 * date. Replayed over the whole ledger it reproduces the Stock Master's average cost exactly, which
 * the report checks whenever nothing has moved since. An item with no costed movement by the date
 * has no historical cost: it is shown unvalued. Today's cost is never substituted.
 *
 * STOCK MASTER. Posting floors the Stock Master quantity at zero when an issue exceeds the balance,
 * but the ledger keeps the full issue. Where that has happened the two differ; the report shows the
 * ledger figure and reports the Stock Master figure (today's on hand less later movements) beside
 * it, so the difference is disclosed rather than hidden.
 */

export class StockOnHandError extends Error {}

type ItemRow = {
  id: string;
  item_code: string | null;
  description: string | null;
  category: string | null;
  entity_type: string | null;
  unit: string | null;
  qty_on_hand: number | string | null;
  average_cost: number | string | null;
  is_active: boolean | null;
};

type LedgerRow = {
  id: string;
  stock_item_id: string;
  movement_date: string;
  created_at: string | null;
  movement_type: string | null;
  quantity_in: number | string | null;
  quantity_out: number | string | null;
  unit_cost: number | string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);

/** Why an as-at date is not acceptable, or null: a real YYYY-MM-DD date, not after today (SA). */
export function asAtDateProblem(value: string | null | undefined, today: string = todayInSouthAfrica()): string | null {
  const text = String(value ?? "").trim();
  if (!text) return "Choose the date to report stock on hand at.";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return `"${text}" is not a date (use YYYY-MM-DD).`;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return `"${text}" is not a real calendar date.`;
  if (text > today) return `${text} is in the future; stock on hand can be reported for today or an earlier date.`;
  return null;
}

/** The cost the weighted-average rule gives over these movements, replayed in posting order; null when none carries a cost. */
function replayCost(rows: LedgerRow[]): number | null {
  const ordered = rows.slice().sort((a, b) => time(a.created_at) - time(b.created_at) || String(a.id).localeCompare(String(b.id)));
  let qty = 0;
  let avg: number | null = null;
  for (const row of ordered) {
    const qtyIn = num(row.quantity_in);
    const qtyOut = num(row.quantity_out);
    const cost = num(row.unit_cost);
    if (row.movement_type === "Cost Update") {
      if (cost > 0) avg = cost;
    } else if (qtyIn > 0) {
      const total = qty + qtyIn;
      avg = total <= 0 ? cost : r4((qty * (avg ?? 0) + qtyIn * cost) / total);
    }
    // The posting function's balance — floored at zero — is what each later receipt averages against.
    qty = Math.max(0, r6(qty + qtyIn - qtyOut));
  }
  return avg;
}

/** Build the report from one company's stock items and ledger rows. Pure: no database. */
export function computeStockOnHand(input: { items: ItemRow[]; ledger: LedgerRow[]; asAt: string; generatedAt?: string }): StockOnHandReport {
  const cutoff = stockTakeCutoff(input.asAt);
  const cutoffTime = Date.parse(cutoff);
  const itemIds = new Set(input.items.map((i) => String(i.id)));
  const known = input.ledger.filter((l) => itemIds.has(String(l.stock_item_id)));
  const unknownItemRows = input.ledger.length - known.length;
  const toDate = known.filter((l) => time(l.movement_date) < cutoffTime);
  const after = known.filter((l) => !(time(l.movement_date) < cutoffTime));

  const byItem = (rows: LedgerRow[]) => {
    const map = new Map<string, LedgerRow[]>();
    for (const row of rows) {
      const k = String(row.stock_item_id);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return map;
  };
  const toDateByItem = byItem(toDate);
  const afterByItem = byItem(after);
  const net = (rows: LedgerRow[]) => r6(rows.reduce((t, l) => t + num(l.quantity_in) - num(l.quantity_out), 0));

  const lines: StockOnHandLine[] = input.items.map((item) => {
    const rows = toDateByItem.get(String(item.id)) || [];
    const qty = net(rows);
    const unitCost = replayCost(rows);
    const masterQty = r6(num(item.qty_on_hand) - net(afterByItem.get(String(item.id)) || []));
    const dates = rows.map((l) => l.movement_date).sort();
    return {
      stockItemId: String(item.id),
      itemCode: String(item.item_code || "—"),
      description: String(item.description || "—"),
      category: String(item.category || "Uncategorised"),
      entityType: String(item.entity_type || "—"),
      group: stockOnHandGroup(item.entity_type),
      unit: String(item.unit || "—"),
      isActive: item.is_active !== false,
      qty,
      unitCost,
      value: unitCost === null ? null : r2(qty * unitCost),
      movementsToDate: rows.length,
      lastMovementDate: dates.length ? dates[dates.length - 1] : null,
      masterQty,
      masterDifference: r6(masterQty - qty),
      recordedLater: rows.filter((l) => time(l.created_at) >= cutoffTime).length,
    };
  });
  lines.sort((a, b) => a.group.localeCompare(b.group) || a.category.localeCompare(b.category) || a.itemCode.localeCompare(b.itemCode));

  const allDates = known.map((l) => l.movement_date).sort();
  const movementQtyTotal = net(toDate);
  const reportQtyTotal = r6(lines.reduce((t, l) => t + l.qty, 0));
  const costChecked = after.length === 0;
  const masterCost = new Map(input.items.map((i) => [String(i.id), num(i.average_cost)]));
  const itemsCostDiffersFromMaster = costChecked ? lines.filter((l) => l.unitCost !== null && Math.abs(l.unitCost - (masterCost.get(l.stockItemId) || 0)) > 1e-4).length : 0;
  const differing = lines.filter((l) => Math.abs(l.masterDifference) >= 1e-6);
  const report: StockOnHandReport = {
    asAt: input.asAt,
    cutoff,
    generatedAt: input.generatedAt || new Date().toISOString(),
    firstMovementDate: allDates[0] || null,
    lastMovementDate: allDates[allDates.length - 1] || null,
    beforeLedgerStart: toDate.length === 0,
    lines,
    reconciliation: {
      movementQtyTotal,
      reportQtyTotal,
      reconciled: Math.abs(movementQtyTotal - reportQtyTotal) < 1e-6,
      ledgerRowsToDate: toDate.length,
      ledgerRowsAfter: after.length,
      unknownItemRows,
      masterQtyTotal: r6(lines.reduce((t, l) => t + l.masterQty, 0)),
      itemsDifferingFromMaster: differing.length,
      costChecked,
      itemsCostDiffersFromMaster,
    },
    disclosures: [],
  };
  report.disclosures = stockOnHandDisclosures(report);
  return report;
}

function stockOnHandDisclosures(report: StockOnHandReport): string[] {
  const out: string[] = [];
  // The South African calendar date of a movement, not its UTC date.
  const day = (iso: string | null) => (iso ? todayInSouthAfrica(new Date(iso)) : "");
  if (!report.firstMovementDate) out.push("No stock movements are recorded for this company, so no stock on hand can be stated for any date.");
  else if (report.beforeLedgerStart)
    out.push(`No stock movement is recorded on or before ${report.asAt}. This company's stock ledger starts on ${day(report.firstMovementDate)}; stock held before then was never recorded in VOLORA, so the zero balances below are not a count.`);
  else out.push(`This company's stock ledger starts on ${day(report.firstMovementDate)}. Balances are built only from movements recorded since then.`);
  const lines = report.lines;
  const noMovement = lines.filter((l) => l.movementsToDate === 0).length;
  if (noMovement && !report.beforeLedgerStart) out.push(`${noMovement} item(s) have no movement recorded by ${report.asAt}; they show 0, meaning nothing was recorded — not that a count found none.`);
  const unvalued = lines.filter((l) => l.value === null && l.qty !== 0);
  if (unvalued.length) out.push(`${unvalued.length} item(s) with a balance have no cost in the ledger by ${report.asAt} and are not valued. Today's cost is not substituted for a historical one.`);
  const negative = lines.filter((l) => l.qty < 0).length;
  if (negative) out.push(`${negative} item(s) have a negative balance: the ledger records more issued (e.g. production consumption) than received by this date.`);
  const r = report.reconciliation;
  if (r.itemsDifferingFromMaster)
    out.push(`${r.itemsDifferingFromMaster} item(s) differ from the Stock Master. When an issue exceeds the balance, posting sets the Stock Master to zero without a ledger entry; the ledger figure is shown, and the Stock Master figure is listed under Reconciliation.`);
  const later = lines.reduce((t, l) => t + l.recordedLater, 0);
  if (later) out.push(`${later} movement(s) dated on or before ${report.asAt} were recorded after it (for example a stock take posted later). A report run on that day would not have included them.`);
  if (r.unknownItemRows) out.push(`${r.unknownItemRows} ledger row(s) refer to stock items that are not in this company's Stock Master and are excluded.`);
  if (!r.reconciled) out.push(`The item balances (${r.reportQtyTotal}) do not equal the ledger movement total (${r.movementQtyTotal}).`);
  if (r.costChecked && r.itemsCostDiffersFromMaster) out.push(`${r.itemsCostDiffersFromMaster} item(s) have a ledger cost that differs from the Stock Master's average cost.`);
  return out;
}

/** Load one company's stock items and ledger and build the report. Every read is scoped to companyId. */
export async function getStockOnHandReport(supabase: SupabaseClient, companyId: string, asAt: string): Promise<StockOnHandReport> {
  const problem = asAtDateProblem(asAt);
  if (problem) throw new StockOnHandError(problem);
  const [items, ledger] = await Promise.all([
    readAllPages<ItemRow>((from, to) =>
      supabase
        .from("vyron_cost_stock_items")
        .select("id, item_code, description, category, entity_type, unit, qty_on_hand, average_cost, is_active")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    readAllPages<LedgerRow>((from, to) =>
      supabase
        .from("vyron_cost_stock_ledger")
        .select("id, stock_item_id, movement_date, created_at, movement_type, quantity_in, quantity_out, unit_cost")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);
  return computeStockOnHand({ items, ledger, asAt });
}
