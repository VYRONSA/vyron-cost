import type { SupabaseClient } from "@supabase/supabase-js";
import { stockTakeCutoff, todayInSouthAfrica } from "@/lib/vyron-stock-take-rules";
import { readAllIn, readAllPages } from "@/lib/vyron-supabase-paging";
import { stockOnHandGroup, type StockOnHandDisclosure, type StockOnHandLine, type StockOnHandReport } from "@/lib/vyron-stock-on-hand-view";

/**
 * VOLORA — Stock on Hand as at a date, rebuilt from the stock ledger.
 *
 * QUANTITY. The ledger (vyron_cost_stock_ledger) is the record of every stock movement, each with an
 * effective movement_date. Stock at the end of a date is the sum of quantity in − quantity out over
 * every movement effective before midnight at the end of that date, South African time — the same
 * cut-off a stock take uses. Nothing is clamped: a negative balance is shown as negative. Before the
 * company's first recorded movement no balance can be stated, and none is: the quantity is null.
 *
 * COST. Stock is costed at weighted average (vyron-inventory postStockMovement): a receipt re-averages
 * the cost over the stock held, a Cost Update replaces it. Replaying that rule over the movements
 * effective by the date, in the order they were posted, gives the cost the ledger supports at that
 * date. Replayed over the whole ledger it reproduces the Stock Master's average cost exactly, which
 * the report checks whenever nothing has moved since. An item with no costed movement by the date
 * has no historical cost: it is shown unvalued. Today's cost is never substituted.
 *
 * VERIFIED. A ledger balance is a reconstruction. A quantity is verified only by a posted physical
 * stock count dated on the as-at date (vyron_cost_stock_counts / _lines); that count is shown beside
 * the ledger balance, never in place of it.
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

type CountRow = { id: string; count_number: string | null; count_date: string; status: string | null };
type CountLineRow = { stock_count_id: string; stock_item_id: string | null; counted_qty: number | string | null };

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

/**
 * Replay movements as postStockMovement applied them, in posting order: the weighted-average cost
 * (null when none carries a cost) and the balance floored at zero, as the Stock Master keeps it.
 */
function replayPosting(rows: LedgerRow[]): { cost: number | null; flooredQty: number } {
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
  return { cost: avg, flooredQty: qty };
}

/** Build the report from one company's stock items, ledger and posted counts. Pure: no database. */
export function computeStockOnHand(input: {
  items: ItemRow[];
  ledger: LedgerRow[];
  asAt: string;
  /** Posted stock counts (any date) and their lines; only those dated on or before the as-at date are used. */
  counts?: CountRow[];
  countLines?: CountLineRow[];
  generatedAt?: string;
}): StockOnHandReport {
  const cutoff = stockTakeCutoff(input.asAt);
  const cutoffTime = Date.parse(cutoff);
  const itemIds = new Set(input.items.map((i) => String(i.id)));
  const known = input.ledger.filter((l) => itemIds.has(String(l.stock_item_id)));
  const unknownItemRows = input.ledger.length - known.length;
  const toDate = known.filter((l) => time(l.movement_date) < cutoffTime);
  const after = known.filter((l) => !(time(l.movement_date) < cutoffTime));
  const historyAvailable = toDate.length > 0;

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
  const knownByItem = byItem(known);
  const afterByItem = byItem(after);
  const net = (rows: LedgerRow[]) => r6(rows.reduce((t, l) => t + num(l.quantity_in) - num(l.quantity_out), 0));

  // The latest posted count of each item dated on or before the as-at date.
  const countsUsed = new Map((input.counts || []).filter((c) => String(c.status) === "Posted" && String(c.count_date).slice(0, 10) <= input.asAt).map((c) => [String(c.id), c]));
  const lastCount = new Map<string, { date: string; countedQty: number; countNumber: string }>();
  for (const line of input.countLines || []) {
    const count = countsUsed.get(String(line.stock_count_id));
    if (!count || !line.stock_item_id) continue;
    const candidate = { date: String(count.count_date).slice(0, 10), countedQty: num(line.counted_qty), countNumber: String(count.count_number || count.id) };
    const current = lastCount.get(String(line.stock_item_id));
    if (!current || candidate.date > current.date || (candidate.date === current.date && candidate.countNumber > current.countNumber)) lastCount.set(String(line.stock_item_id), candidate);
  }

  const lines: StockOnHandLine[] = input.items.map((item) => {
    const rows = toDateByItem.get(String(item.id)) || [];
    const qty = historyAvailable ? net(rows) : null;
    const unitCost = historyAvailable ? replayPosting(rows).cost : null;
    const masterQty = r6(num(item.qty_on_hand) - net(afterByItem.get(String(item.id)) || []));
    const masterDifference = qty === null ? null : r6(masterQty - qty);
    // Does posting's zero floor, replayed over the whole ledger, reproduce today's Stock Master?
    const floorExplains = Math.abs(replayPosting(knownByItem.get(String(item.id)) || []).flooredQty - num(item.qty_on_hand)) < 1e-6;
    const dates = rows.map((l) => l.movement_date).sort();
    const count = lastCount.get(String(item.id)) || null;
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
      value: qty === null || unitCost === null ? null : r2(qty * unitCost),
      movementsToDate: rows.length,
      lastMovementDate: dates.length ? dates[dates.length - 1] : null,
      verifiedQty: count && count.date === input.asAt ? count.countedQty : null,
      lastCount: count,
      masterQty,
      masterDifference,
      masterDifferenceCause: masterDifference === null || Math.abs(masterDifference) < 1e-6 ? null : floorExplains ? "zero_floor" : "unrecorded",
      recordedLater: rows.filter((l) => time(l.created_at) >= cutoffTime).length,
    };
  });
  lines.sort((a, b) => a.group.localeCompare(b.group) || a.category.localeCompare(b.category) || a.itemCode.localeCompare(b.itemCode));

  const allDates = known.map((l) => l.movement_date).sort();
  const movementQtyTotal = net(toDate);
  const reportQtyTotal = r6(lines.reduce((t, l) => t + (l.qty ?? 0), 0));
  const costChecked = after.length === 0 && historyAvailable;
  const masterCost = new Map(input.items.map((i) => [String(i.id), num(i.average_cost)]));
  const itemsCostDiffersFromMaster = costChecked ? lines.filter((l) => l.unitCost !== null && Math.abs(l.unitCost - (masterCost.get(l.stockItemId) || 0)) > 1e-4).length : 0;
  const verified = lines.filter((l) => l.verifiedQty !== null);
  const report: StockOnHandReport = {
    asAt: input.asAt,
    cutoff,
    generatedAt: input.generatedAt || new Date().toISOString(),
    firstMovementDate: allDates[0] || null,
    lastMovementDate: allDates[allDates.length - 1] || null,
    historyAvailable,
    lines,
    reconciliation: {
      movementQtyTotal,
      reportQtyTotal,
      reconciled: Math.abs(movementQtyTotal - reportQtyTotal) < 1e-6,
      ledgerRowsToDate: toDate.length,
      ledgerRowsAfter: after.length,
      unknownItemRows,
      masterQtyTotal: r6(lines.reduce((t, l) => t + l.masterQty, 0)),
      itemsDifferingFromMaster: lines.filter((l) => l.masterDifference !== null && Math.abs(l.masterDifference) >= 1e-6).length,
      costChecked,
      itemsCostDiffersFromMaster,
      itemsVerified: verified.length,
      itemsVerifiedDiffering: verified.filter((l) => l.qty !== null && Math.abs((l.verifiedQty as number) - l.qty) >= 1e-6).length,
    },
    disclosures: [],
  };
  report.disclosures = stockOnHandDisclosures(report);
  return report;
}

function stockOnHandDisclosures(report: StockOnHandReport): StockOnHandDisclosure[] {
  const out: StockOnHandDisclosure[] = [];
  // The South African calendar date of a movement, not its UTC date.
  const day = (iso: string | null) => (iso ? todayInSouthAfrica(new Date(iso)) : "");
  const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const r = report.reconciliation;
  const lines = report.lines;

  if (!report.firstMovementDate) {
    out.push({ kind: "history_unavailable", level: "critical", text: "Historical stock cannot be established: no stock movements are recorded for this company, so no balance can be stated for any date. Quantities are shown as 'History unavailable', not zero." });
    return out;
  }
  if (!report.historyAvailable) {
    out.push({
      kind: "history_unavailable",
      level: "critical",
      text: `Historical stock cannot be established for ${report.asAt}: this company's stock ledger starts on ${day(report.firstMovementDate)}. Stock held before then was never recorded in VOLORA, so quantities are shown as 'History unavailable' — not zero, and not a count.`,
    });
    return out;
  }

  out.push({
    kind: "basis",
    level: "info",
    text: `Ledger balances are reconstructed from the stock movements recorded in VOLORA from ${day(report.firstMovementDate)} to the end of ${report.asAt}. They show what the records calculate, not what was physically on hand. ${r.itemsVerified ? `${r.itemsVerified} item(s) were verified by a posted physical count on ${report.asAt}; the count is shown beside the ledger balance.` : `No posted physical count is dated ${report.asAt}, so no balance on this report is verified by a count.`}`,
  });

  const negative = lines.filter((l) => l.qty !== null && l.qty < 0);
  if (negative.length) {
    const value = r2(negative.reduce((t, l) => t + (l.value ?? 0), 0));
    out.push({
      kind: "incomplete_records",
      level: "warning",
      text: `${negative.length} item(s) have a negative ledger balance (valued at ${money(value)} where a cost exists): more is recorded as issued — for example production consumption — than received by this date. This usually means receipts are missing or late, or records are otherwise inconsistent. It is not proof of negative physical stock.`,
    });
  }
  const floored = lines.filter((l) => l.masterDifferenceCause === "zero_floor").length;
  const unrecorded = lines.filter((l) => l.masterDifferenceCause === "unrecorded").length;
  if (floored)
    out.push({
      kind: "incomplete_records",
      level: "warning",
      text: `${floored} item(s) differ from the Stock Master because, when an issue exceeded the balance, posting set the Stock Master to zero without a ledger entry. The ledger figure is shown; the Stock Master figure is listed under Reconciliation.`,
    });
  if (unrecorded)
    out.push({
      kind: "incomplete_records",
      level: "warning",
      text: `${unrecorded} item(s) have a Stock Master quantity that no ledger movement explains (for example stock loaded directly rather than posted). Their history is incomplete: the ledger figure is shown; the Stock Master figure is listed under Reconciliation.`,
    });
  if (r.itemsVerifiedDiffering)
    out.push({
      kind: "incomplete_records",
      level: "warning",
      text: `${r.itemsVerifiedDiffering} item(s) counted on ${report.asAt} have a ledger balance different from the posted count; see the item notes.`,
    });
  const noMovement = lines.filter((l) => l.movementsToDate === 0).length;
  if (noMovement)
    out.push({ kind: "incomplete_records", level: "info", text: `${noMovement} item(s) have no movement recorded by ${report.asAt}; their 0 means nothing was recorded — not that a count found none.` });
  const unvalued = lines.filter((l) => l.qty !== null && l.qty !== 0 && l.value === null).length;
  if (unvalued)
    out.push({ kind: "cost_unavailable", level: "warning", text: `Historical cost unavailable for ${unvalued} item(s) with a balance: no movement up to ${report.asAt} carries a cost. They are not valued; today's cost is not substituted.` });
  const later = lines.reduce((t, l) => t + l.recordedLater, 0);
  if (later)
    out.push({ kind: "recorded_later", level: "info", text: `${later} movement(s) dated on or before ${report.asAt} were recorded after it (for example a stock take posted later). A report run on that day would not have included them.` });
  if (r.unknownItemRows) out.push({ kind: "excluded_rows", level: "warning", text: `${r.unknownItemRows} ledger row(s) refer to stock items that are not in this company's Stock Master and are excluded.` });
  if (!r.reconciled)
    out.push({ kind: "reconciliation", level: "critical", text: `The item balances (${r.reportQtyTotal}) do not add up to the recorded ledger movements (${r.movementQtyTotal}).` });
  if (r.costChecked && r.itemsCostDiffersFromMaster)
    out.push({ kind: "reconciliation", level: "warning", text: `${r.itemsCostDiffersFromMaster} item(s) have a ledger cost that differs from the Stock Master's average cost.` });
  return out;
}

/** Load one company's stock items, ledger and posted counts and build the report. Every read is scoped to companyId. */
export async function getStockOnHandReport(supabase: SupabaseClient, companyId: string, asAt: string): Promise<StockOnHandReport> {
  const problem = asAtDateProblem(asAt);
  if (problem) throw new StockOnHandError(problem);
  const [items, ledger, counts] = await Promise.all([
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
    readAllPages<CountRow>((from, to) =>
      supabase
        .from("vyron_cost_stock_counts")
        .select("id, count_number, count_date, status")
        .eq("company_id", companyId)
        .eq("status", "Posted")
        .lte("count_date", asAt)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);
  const countLines = await readAllIn<CountLineRow>(
    counts.map((c) => String(c.id)),
    (chunk, from, to) =>
      supabase
        .from("vyron_cost_stock_count_lines")
        .select("stock_count_id, stock_item_id, counted_qty")
        .eq("company_id", companyId)
        .in("stock_count_id", chunk)
        .order("id", { ascending: true })
        .range(from, to)
  );
  return computeStockOnHand({ items, ledger, asAt, counts, countLines });
}
