import type { SupabaseClient } from "@supabase/supabase-js";
import { getBomCompletenessReport, type BomCompletenessRow } from "@/lib/vyron-bom-completeness";

/**
 * Daily Production Control Report.
 *
 * Built on the recognised elements of a daily production control pack: the
 * schedule (what was planned for the day), plan attainment (planned vs actual
 * against the ORIGINAL issued plan), material readiness (can the open plan be
 * made from stock, without double-allocating it), performance indicators, and
 * an exception list with the next action for each.
 *
 * DATA, NOT ESTIMATES.
 *  - Jobs are MFG production runs (vyron_cost_production_runs) — the only
 *    production records that capture planned AND actual output.
 *  - Planned = the run's planned_qty, which completion never overwrites.
 *  - Actual = actual_qty of a COMPLETED run only. A run in production has no
 *    recorded output yet, so its actual is 0, never its plan.
 *  - Schedule date = planned_date when captured, otherwise the date the run was
 *    created (its planning date) — always labelled with its source.
 *  - Required date, priority, area, rejected/rework and downtime are reported
 *    only where captured; otherwise "Not captured". OEE, machine utilisation
 *    and labour efficiency are never calculated: no machine, time or attendance
 *    data exists.
 *  - Material readiness uses each open run's own requirement lines (the issued
 *    plan) against stock on hand, allocating stock to open runs in schedule
 *    order so stock needed by an earlier run is not counted again for a later
 *    one. Ingredients are not otherwise reserved in this system.
 */

export type ProductionView = "daily" | "weekly" | "monthly";

export type RunRow = Record<string, unknown> & {
  id: string;
  run_number: string | null;
  product_id: string | null;
  product_name_snapshot: string | null;
  bom_id: string | null;
  bom_name_snapshot: string | null;
  status: string;
  planned_qty: number | null;
  actual_qty: number | null;
  planned_cost: number | null;
  total_production_cost: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  started_by: string | null;
  completed_by: string | null;
  notes: string | null;
};
export type RunLineRow = {
  production_run_id: string;
  line_type: string | null;
  ingredient_id: string | null;
  stock_item_id: string | null;
  line_name: string | null;
  unit: string | null;
  planned_qty: number | null;
  unit_cost: number | null;
};
export type StockItemRow = { id: string; entity_type: string | null; entity_id: string | null; description: string | null; unit: string | null; qty_on_hand: number | null };
export type OpenPoLine = { ingredient_id: string | null; item_id: string | null; outstanding_qty: number; po_number: string; status: string; expected_date: string | null };
export type ProductRow = { id: string; product_name: string; sku: string | null; selling_price: number | null };
export type WastageRow = { production_run_id: string; waste_qty: number | null; waste_value: number | null };

export type JobStatus = "Not Started" | "In Production" | "Completed" | "On Hold" | "Cancelled" | "Reversed";

export type MaterialLine = {
  key: string;
  name: string;
  unit: string;
  required: number;
  available: number | null;
  allocatedToEarlierJobs: number;
  shortage: number;
  onOrder: number;
  onOrderRefs: string[];
  status: "Ready" | "Short" | "Not stocked" | "No stock item";
};

export type ProductionJob = {
  id: string;
  jobNumber: string;
  product: string;
  productId: string | null;
  itemCode: string | null;
  scheduleDate: string;
  scheduleSource: "planned" | "created";
  originalPlannedDate: string | null;
  requiredDate: string | null;
  plannedQty: number;
  actualQty: number;
  actualRecorded: boolean;
  outstandingQty: number;
  variance: number | null;
  achievementPct: number | null;
  status: JobStatus;
  systemStatus: string;
  priority: string | null;
  area: string | null;
  responsible: string | null;
  carriedForward: boolean;
  overdue: boolean | null;
  urgent: boolean;
  completedOn: string | null;
  onTime: boolean | null;
  rejectedQty: number | null;
  reworkQty: number | null;
  wasteQty: number;
  downtimeMinutes: number | null;
  downtimeReason: string | null;
  plannedCost: number;
  productionCost: number | null;
  outputValue: number | null;
  outstandingValue: number | null;
  materials: MaterialLine[] | null;
  materialStatus: "Ready" | "Short" | "Not assessed" | "Consumed";
  bomWarning: string | null;
  missingCostLines: number;
};

export type ProductionException = {
  type:
    | "Production delayed"
    | "Overdue completion"
    | "Production order not started"
    | "Insufficient stock"
    | "Missing ingredients"
    | "Incomplete BOM"
    | "Missing cost"
    | "Quality / rework"
    | "On hold";
  jobNumber: string;
  product: string;
  reason: string;
  action: string;
};

export type ProductSummary = {
  product: string;
  itemCode: string | null;
  plannedQty: number;
  actualQty: number;
  remainingQty: number;
  variance: number;
  achievementPct: number | null;
  carryForwardQty: number;
  jobs: number;
};

export type PeriodBucket = {
  label: string;
  from: string;
  to: string;
  jobs: number;
  completed: number;
  cancelled: number;
  plannedQty: number;
  actualQty: number;
  achievementPct: number | null;
  productionCost: number;
};

export type ProductionControlReport = {
  from: string;
  to: string;
  today: string;
  view: ProductionView;
  jobs: ProductionJob[];
  products: ProductSummary[];
  buckets: PeriodBucket[];
  exceptions: ProductionException[];
  shortages: (MaterialLine & { jobs: string[] })[];
  kpis: {
    jobsScheduled: number;
    jobsCompleted: number;
    jobsInProgress: number;
    jobsNotStarted: number;
    jobsOverdue: number;
    jobsOnHold: number;
    jobsCancelled: number;
    jobsCarriedForward: number;
    materialShortageJobs: number;
    plannedUnits: number;
    actualUnits: number;
    achievementPct: number | null;
    outstandingValue: number | null;
    outstandingValueExcludedJobs: number;
    productionCost: number;
    outputValue: number | null;
    scheduleAdherencePct: number | null;
    onTimeCompletionPct: number | null;
    rejectedUnits: number | null;
    reworkUnits: number | null;
    firstPassYieldPct: number | null;
    downtimeMinutes: number | null;
    wasteUnits: number;
  };
  dataNotes: string[];
  unavailable: { metric: string; reason: string }[];
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const isoDate = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const CONSUMABLE = new Set(["ingredient", "packaging"]);

/** SA local date of a timestamp (production days are South African days). */
export function saDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", { timeZone: "Africa/Johannesburg" });
}

function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function monthEnd(date: string) {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function jobStatus(run: RunRow): JobStatus {
  const s = String(run.status || "");
  if (s === "Completed") return "Completed";
  if (s === "Cancelled") return "Cancelled";
  if (s === "Reversed") return "Reversed";
  if (run.on_hold === true) return "On Hold";
  if (s === "In Production") return "In Production";
  return "Not Started";
}

export type ProductionControlInput = {
  from: string;
  to: string;
  today: string;
  view: ProductionView;
  runs: RunRow[];
  runLines: RunLineRow[];
  stockItems: StockItemRow[];
  openPoLines: OpenPoLine[];
  products: ProductRow[];
  productCodes?: Map<string, string>;
  wastage: WastageRow[];
  bomRows: BomCompletenessRow[];
  /** False when the production-control columns are not in the database yet. */
  controlFieldsAvailable: boolean;
};

export function buildProductionControlReport(input: ProductionControlInput): ProductionControlReport {
  const { from, to, today, view } = input;
  const productById = new Map(input.products.map((p) => [String(p.id), p]));
  const codes = input.productCodes ?? new Map<string, string>();
  const bomByProduct = new Map(input.bomRows.map((r) => [r.productId, r]));
  const stockById = new Map(input.stockItems.map((s) => [String(s.id), s]));
  const stockByEntity = new Map<string, StockItemRow>();
  for (const s of input.stockItems) if (s.entity_id) stockByEntity.set(`${s.entity_type}:${s.entity_id}`, s);
  const linesByRun = new Map<string, RunLineRow[]>();
  for (const l of input.runLines) {
    const list = linesByRun.get(String(l.production_run_id)) || [];
    list.push(l);
    linesByRun.set(String(l.production_run_id), list);
  }
  const wasteByRun = new Map<string, number>();
  for (const w of input.wastage) wasteByRun.set(String(w.production_run_id), (wasteByRun.get(String(w.production_run_id)) || 0) + num(w.waste_qty));
  const onOrderByKey = new Map<string, { qty: number; refs: string[] }>();
  for (const po of input.openPoLines) {
    for (const k of [po.ingredient_id && `ingredient:${po.ingredient_id}`, po.item_id && `item:${po.item_id}`].filter(Boolean) as string[]) {
      const e = onOrderByKey.get(k) || { qty: 0, refs: [] };
      e.qty += po.outstanding_qty;
      e.refs.push(`${po.po_number} (${po.status}${po.expected_date ? `, due ${po.expected_date}` : ""})`);
      onOrderByKey.set(k, e);
    }
  }

  const scheduleOf = (run: RunRow) => {
    const planned = isoDate(run.planned_date);
    return planned ? { date: planned, source: "planned" as const } : { date: saDate(run.created_at) || today, source: "created" as const };
  };
  const isOpen = (s: JobStatus) => s === "Not Started" || s === "In Production" || s === "On Hold";

  /* ------------------------------------------------ material allocation */
  // Every open run, in schedule order, draws from stock on hand. A later run
  // only sees what earlier open runs have not already claimed.
  const openRuns = input.runs
    .filter((r) => isOpen(jobStatus(r)))
    .sort((a, b) => scheduleOf(a).date.localeCompare(scheduleOf(b).date) || String(a.created_at).localeCompare(String(b.created_at)));
  const remaining = new Map<string, number>();
  const materialsByRun = new Map<string, MaterialLine[]>();
  for (const run of openRuns) {
    const lines = (linesByRun.get(String(run.id)) || []).filter((l) => CONSUMABLE.has(String(l.line_type || "").toLowerCase()));
    const out: MaterialLine[] = [];
    for (const l of lines) {
      const stock =
        (l.stock_item_id && stockById.get(String(l.stock_item_id))) ||
        (l.ingredient_id ? stockByEntity.get(`ingredient:${l.ingredient_id}`) || stockByEntity.get(`packaging:${l.ingredient_id}`) : undefined);
      const required = num(l.planned_qty);
      const key = stock ? `stock:${stock.id}` : `line:${l.ingredient_id || l.line_name}`;
      const onOrder = (l.ingredient_id && onOrderByKey.get(`ingredient:${l.ingredient_id}`)) || (stock && onOrderByKey.get(`item:${stock.id}`)) || null;
      if (!stock) {
        out.push({
          key,
          name: String(l.line_name || "Unnamed line"),
          unit: String(l.unit || ""),
          required,
          available: null,
          allocatedToEarlierJobs: 0,
          shortage: required,
          onOrder: onOrder?.qty ?? 0,
          onOrderRefs: onOrder?.refs ?? [],
          status: l.ingredient_id ? "Not stocked" : "No stock item",
        });
        continue;
      }
      const onHand = num(stock.qty_on_hand);
      if (!remaining.has(key)) remaining.set(key, onHand);
      const before = remaining.get(key)!;
      const shortage = Math.max(0, required - Math.max(0, before));
      remaining.set(key, before - required);
      out.push({
        key,
        name: String(l.line_name || stock.description || "Item"),
        unit: String(l.unit || stock.unit || ""),
        required: round(required),
        available: round(onHand),
        allocatedToEarlierJobs: round(onHand - before),
        shortage: round(shortage),
        onOrder: round(onOrder?.qty ?? 0),
        onOrderRefs: onOrder?.refs ?? [],
        status: shortage > 0.00005 ? "Short" : "Ready",
      });
    }
    materialsByRun.set(String(run.id), out);
  }

  /* ------------------------------------------------------------- jobs */
  const jobs: ProductionJob[] = [];
  for (const run of input.runs) {
    const status = jobStatus(run);
    const sched = scheduleOf(run);
    const completedOn = status === "Completed" || status === "Reversed" ? saDate(run.completed_at) : null;
    const inRange = sched.date >= from && sched.date <= to;
    const carried = !inRange && sched.date < from && isOpen(status);
    if (!inRange && !carried) continue;

    const product = run.product_id ? productById.get(String(run.product_id)) : undefined;
    const planned = num(run.planned_qty);
    const actualRecorded = status === "Completed";
    const actual = actualRecorded ? num(run.actual_qty) : 0;
    const outstanding = status === "Cancelled" || status === "Completed" || status === "Reversed" ? 0 : Math.max(0, planned - actual);
    const required = isoDate(run.due_date);
    const overdue = required ? isOpen(status) && required < today : null;
    const priority = str(run.priority);
    const sell = num(product?.selling_price);
    const lines = linesByRun.get(String(run.id)) || [];
    const missingCostLines = lines.filter((l) => CONSUMABLE.has(String(l.line_type || "").toLowerCase()) && num(l.unit_cost) <= 0).length;
    const bomRow = run.product_id ? bomByProduct.get(String(run.product_id)) : undefined;
    let bomWarning: string | null = null;
    if (bomRow?.classification === "OVERRIDDEN") {
      bomWarning = `BOM manually overridden (system status ${bomRow.bomStatus}) — material requirement may be incomplete.`;
    } else if (bomRow && bomRow.bomStatus !== "COMPLETE") {
      bomWarning = `BOM ${bomRow.bomStatus}: ${bomRow.classificationReason}`;
    }
    const materials = materialsByRun.get(String(run.id)) ?? null;
    const rejected = run.rejected_qty === null || run.rejected_qty === undefined ? null : num(run.rejected_qty);
    const rework = run.rework_qty === null || run.rework_qty === undefined ? null : num(run.rework_qty);

    jobs.push({
      id: String(run.id),
      jobNumber: String(run.run_number || run.id),
      product: String(product?.product_name || run.product_name_snapshot || "Unknown product"),
      productId: run.product_id ? String(run.product_id) : null,
      itemCode: (run.product_id && (str(product?.sku) || codes.get(String(run.product_id)))) || null,
      scheduleDate: sched.date,
      scheduleSource: sched.source,
      originalPlannedDate: isoDate(run.original_planned_date),
      requiredDate: required,
      plannedQty: planned,
      actualQty: actual,
      actualRecorded,
      outstandingQty: outstanding,
      variance: actualRecorded ? round(actual - planned) : null,
      achievementPct: actualRecorded && planned > 0 ? round((actual / planned) * 100, 1) : null,
      status,
      systemStatus: String(run.status),
      priority,
      area: str(run.production_area),
      responsible: str(run.responsible_person) || str(run.started_by) || str(run.created_by),
      carriedForward: carried,
      overdue,
      urgent: priority === "Urgent" || priority === "High",
      completedOn,
      onTime: completedOn && required ? completedOn <= required : null,
      rejectedQty: rejected,
      reworkQty: rework,
      wasteQty: wasteByRun.get(String(run.id)) || 0,
      downtimeMinutes: run.downtime_minutes === null || run.downtime_minutes === undefined ? null : num(run.downtime_minutes),
      downtimeReason: str(run.downtime_reason),
      plannedCost: num(run.planned_cost),
      productionCost: actualRecorded ? num(run.total_production_cost) : null,
      outputValue: actualRecorded && sell > 0 ? round(actual * sell, 2) : null,
      outstandingValue: outstanding > 0 && sell > 0 ? round(outstanding * sell, 2) : outstanding > 0 ? null : 0,
      materials,
      materialStatus: isOpen(status)
        ? materials && materials.length
          ? materials.some((m) => m.status !== "Ready")
            ? "Short"
            : "Ready"
          : "Not assessed"
        : status === "Completed"
          ? "Consumed"
          : "Not assessed",
      bomWarning,
      missingCostLines,
    });
  }
  jobs.sort(
    (a, b) =>
      Number(b.carriedForward) - Number(a.carriedForward) ||
      a.scheduleDate.localeCompare(b.scheduleDate) ||
      Number(b.urgent) - Number(a.urgent) ||
      a.jobNumber.localeCompare(b.jobNumber)
  );

  const scheduled = jobs.filter((j) => !j.carriedForward);
  const live = scheduled.filter((j) => j.status !== "Cancelled");

  /* --------------------------------------------------------- products */
  const byProduct = new Map<string, ProductSummary>();
  for (const j of jobs) {
    if (j.status === "Cancelled") continue;
    const k = j.productId || j.product;
    const e = byProduct.get(k) || {
      product: j.product,
      itemCode: j.itemCode,
      plannedQty: 0,
      actualQty: 0,
      remainingQty: 0,
      variance: 0,
      achievementPct: null,
      carryForwardQty: 0,
      jobs: 0,
    };
    if (j.carriedForward) e.carryForwardQty += j.outstandingQty;
    else {
      e.plannedQty += j.plannedQty;
      e.actualQty += j.actualQty;
      e.remainingQty += j.outstandingQty;
      e.jobs += 1;
    }
    byProduct.set(k, e);
  }
  const products = [...byProduct.values()]
    .map((p) => ({
      ...p,
      plannedQty: round(p.plannedQty),
      actualQty: round(p.actualQty),
      remainingQty: round(p.remainingQty),
      carryForwardQty: round(p.carryForwardQty),
      variance: round(p.actualQty - p.plannedQty),
      achievementPct: p.plannedQty > 0 ? round((p.actualQty / p.plannedQty) * 100, 1) : null,
    }))
    .sort((a, b) => b.plannedQty - a.plannedQty || a.product.localeCompare(b.product));

  /* ---------------------------------------------------------- buckets */
  const bucketKey = (date: string) => (view === "monthly" ? date.slice(0, 7) : view === "weekly" ? weekStart(date) : date);
  const bucketMap = new Map<string, PeriodBucket>();
  for (const j of scheduled) {
    const k = bucketKey(j.scheduleDate);
    const b = bucketMap.get(k) || {
      label: view === "monthly" ? k : view === "weekly" ? `Week of ${k}` : k,
      from: view === "monthly" ? `${k}-01` : k,
      to: view === "monthly" ? monthEnd(`${k}-01`) : view === "weekly" ? addDays(k, 6) : k,
      jobs: 0,
      completed: 0,
      cancelled: 0,
      plannedQty: 0,
      actualQty: 0,
      achievementPct: null,
      productionCost: 0,
    };
    b.jobs += 1;
    if (j.status === "Completed") b.completed += 1;
    if (j.status === "Cancelled") b.cancelled += 1;
    else {
      b.plannedQty += j.plannedQty;
      b.actualQty += j.actualQty;
      b.productionCost += j.productionCost ?? 0;
    }
    bucketMap.set(k, b);
  }
  const buckets = [...bucketMap.values()]
    .map((b) => ({
      ...b,
      plannedQty: round(b.plannedQty),
      actualQty: round(b.actualQty),
      productionCost: round(b.productionCost, 2),
      achievementPct: b.plannedQty > 0 ? round((b.actualQty / b.plannedQty) * 100, 1) : null,
    }))
    .sort((a, b) => a.from.localeCompare(b.from));

  /* ------------------------------------------------------- exceptions */
  const exceptions: ProductionException[] = [];
  for (const j of jobs) {
    const base = { jobNumber: j.jobNumber, product: j.product };
    if (j.status === "On Hold") {
      exceptions.push({ ...base, type: "On hold", reason: str(input.runs.find((r) => String(r.id) === j.id)?.on_hold_reason) || "Placed on hold (no reason recorded).", action: "Resolve the hold reason and release the job, or reschedule it." });
    }
    if (j.status === "Not Started" && j.scheduleDate < today) {
      exceptions.push({
        ...base,
        type: j.carriedForward ? "Production delayed" : "Production order not started",
        reason: `Scheduled for ${j.scheduleDate}${j.scheduleSource === "created" ? " (creation date — no planned date captured)" : ""} and not started.`,
        action: "Start the run, or capture a new planned date if it has been rescheduled.",
      });
    } else if (j.carriedForward && isOpen(j.status) && j.status !== "On Hold") {
      exceptions.push({ ...base, type: "Production delayed", reason: `Scheduled for ${j.scheduleDate}; ${j.outstandingQty} still outstanding and carried forward.`, action: "Complete the run and record the actual output." });
    }
    if (j.overdue) {
      exceptions.push({ ...base, type: "Overdue completion", reason: `Required by ${j.requiredDate}; status ${j.status}.`, action: "Expedite or agree a new required date with the customer." });
    }
    for (const m of j.materials || []) {
      if (m.status === "Short") {
        exceptions.push({
          ...base,
          type: "Insufficient stock",
          reason: `${m.name}: needs ${m.required} ${m.unit}, ${Math.max(0, (m.available ?? 0) - m.allocatedToEarlierJobs)} ${m.unit} left after earlier jobs — short ${m.shortage} ${m.unit}.${m.onOrder > 0 ? ` On order: ${m.onOrder} (${m.onOrderRefs.join("; ")}).` : " Nothing on order."}`,
          action: m.onOrder > 0 ? "Expedite the open purchase order / GRN before the run starts." : "Raise a purchase order or reschedule the run.",
        });
      } else if (m.status === "Not stocked" || m.status === "No stock item") {
        exceptions.push({
          ...base,
          type: "Missing ingredients",
          reason: `${m.name} has no stock record, so its availability cannot be checked.`,
          action: "Create the stock item (receive it on a GRN or opening stock) so availability is measured.",
        });
      }
    }
    if (j.bomWarning && isOpen(j.status)) {
      exceptions.push({ ...base, type: "Incomplete BOM", reason: j.bomWarning, action: "Correct the BOM (see Reports → BOM Completeness); material readiness is incomplete until then." });
    }
    if (j.missingCostLines > 0 && j.status !== "Cancelled") {
      exceptions.push({ ...base, type: "Missing cost", reason: `${j.missingCostLines} requirement line(s) carry no unit cost, so the job cost is understated.`, action: "Price the ingredient(s) from a supplier invoice or the ingredient master." });
    }
    if ((j.rejectedQty ?? 0) > 0 || (j.reworkQty ?? 0) > 0) {
      exceptions.push({ ...base, type: "Quality / rework", reason: `Rejected ${j.rejectedQty ?? 0}, rework ${j.reworkQty ?? 0}.`, action: "Record the root cause and corrective action." });
    }
  }

  /* --------------------------------------------------------- shortages */
  const shortageMap = new Map<string, MaterialLine & { jobs: string[] }>();
  for (const j of jobs) {
    for (const m of j.materials || []) {
      if (m.status === "Ready") continue;
      const e = shortageMap.get(m.key) || { ...m, required: 0, shortage: 0, jobs: [] };
      e.required = round(e.required + m.required);
      e.shortage = round(e.shortage + m.shortage);
      e.jobs.push(j.jobNumber);
      shortageMap.set(m.key, e);
    }
  }

  /* -------------------------------------------------------------- KPIs */
  const completed = live.filter((j) => j.status === "Completed");
  const withPlannedDate = completed.filter((j) => j.scheduleSource === "planned");
  const withDue = completed.filter((j) => j.requiredDate);
  const quality = completed.filter((j) => j.rejectedQty !== null || j.reworkQty !== null);
  const downtime = jobs.filter((j) => j.downtimeMinutes !== null);
  const plannedUnits = live.reduce((s, j) => s + j.plannedQty, 0);
  const actualUnits = live.reduce((s, j) => s + j.actualQty, 0);
  const outstandingJobs = jobs.filter((j) => j.outstandingQty > 0);
  const outputKnown = completed.filter((j) => j.outputValue !== null);

  const kpis: ProductionControlReport["kpis"] = {
    jobsScheduled: live.length,
    jobsCompleted: completed.length,
    jobsInProgress: jobs.filter((j) => j.status === "In Production").length,
    jobsNotStarted: jobs.filter((j) => j.status === "Not Started").length,
    jobsOverdue: jobs.filter((j) => j.overdue === true).length,
    jobsOnHold: jobs.filter((j) => j.status === "On Hold").length,
    jobsCancelled: scheduled.filter((j) => j.status === "Cancelled").length,
    jobsCarriedForward: jobs.filter((j) => j.carriedForward).length,
    materialShortageJobs: jobs.filter((j) => j.materialStatus === "Short").length,
    plannedUnits: round(plannedUnits),
    actualUnits: round(actualUnits),
    achievementPct: plannedUnits > 0 ? round((actualUnits / plannedUnits) * 100, 1) : null,
    outstandingValue: outstandingJobs.some((j) => j.outstandingValue !== null)
      ? round(outstandingJobs.reduce((s, j) => s + (j.outstandingValue ?? 0), 0), 2)
      : outstandingJobs.length
        ? null
        : 0,
    outstandingValueExcludedJobs: outstandingJobs.filter((j) => j.outstandingValue === null).length,
    productionCost: round(completed.reduce((s, j) => s + (j.productionCost ?? 0), 0), 2),
    outputValue: outputKnown.length ? round(outputKnown.reduce((s, j) => s + (j.outputValue ?? 0), 0), 2) : null,
    scheduleAdherencePct: withPlannedDate.length
      ? round((withPlannedDate.filter((j) => j.completedOn === j.scheduleDate).length / withPlannedDate.length) * 100, 1)
      : null,
    onTimeCompletionPct: withDue.length ? round((withDue.filter((j) => j.onTime).length / withDue.length) * 100, 1) : null,
    rejectedUnits: quality.length ? round(quality.reduce((s, j) => s + (j.rejectedQty ?? 0), 0)) : null,
    reworkUnits: quality.length ? round(quality.reduce((s, j) => s + (j.reworkQty ?? 0), 0)) : null,
    firstPassYieldPct: (() => {
      const out = quality.reduce((s, j) => s + j.actualQty, 0);
      if (!quality.length || out <= 0) return null;
      const bad = quality.reduce((s, j) => s + (j.rejectedQty ?? 0) + (j.reworkQty ?? 0), 0);
      return round(Math.max(0, ((out - bad) / out) * 100), 1);
    })(),
    downtimeMinutes: downtime.length ? round(downtime.reduce((s, j) => s + (j.downtimeMinutes ?? 0), 0), 1) : null,
    wasteUnits: round(jobs.reduce((s, j) => s + j.wasteQty, 0)),
  };

  /* --------------------------------------------------------- disclosures */
  const dataNotes: string[] = [];
  const equal = completed.filter((j) => Math.abs(j.actualQty - j.plannedQty) < 0.00005).length;
  if (completed.length && equal === completed.length) {
    dataNotes.push(
      `Actual output equals planned output on all ${completed.length} completed job(s) in this period. The completion form pre-fills the actual quantity with the planned quantity, so these actuals are as recorded and may not be independent counts — confirm the actual quantity when completing a run.`
    );
  } else if (equal > 0) {
    dataNotes.push(`${equal} of ${completed.length} completed job(s) record actual exactly equal to planned (the completion form pre-fills actual with planned).`);
  }
  const createdDated = jobs.filter((j) => j.scheduleSource === "created").length;
  if (createdDated) {
    dataNotes.push(`${createdDated} job(s) have no planned production date captured; they are scheduled on the date the run was created.`);
  }
  if (!input.controlFieldsAvailable) {
    dataNotes.push("Production control fields (planned date, required date, priority, area, responsible person, rejects, rework, downtime) are not installed in this database yet.");
  }
  dataNotes.push("Ingredients are not reserved per production run in this system; this report allocates stock on hand to open runs in schedule order so the same stock is never counted twice.");

  const unavailable: { metric: string; reason: string }[] = [
    { metric: "OEE", reason: "Needs machine run time, ideal cycle time and planned production time — not captured." },
    { metric: "Machine utilisation", reason: "No machine or work-centre records exist." },
    { metric: "Labour efficiency", reason: "No attendance or clocked labour hours are captured against runs." },
  ];
  if (kpis.scheduleAdherencePct === null) unavailable.push({ metric: "Schedule adherence", reason: "No completed job in the period has a captured planned date." });
  if (kpis.onTimeCompletionPct === null) unavailable.push({ metric: "On-time completion", reason: "No completed job in the period has a captured required date." });
  if (kpis.firstPassYieldPct === null) unavailable.push({ metric: "First-pass yield / rejects / rework", reason: "No rejected or rework quantity captured on completed jobs." });
  if (kpis.downtimeMinutes === null) unavailable.push({ metric: "Downtime", reason: "No downtime captured on jobs in the period." });

  return {
    from,
    to,
    today,
    view,
    jobs,
    products,
    buckets,
    exceptions,
    shortages: [...shortageMap.values()].sort((a, b) => b.shortage - a.shortage),
    kpis,
    dataNotes,
    unavailable,
  };
}

/* ======================================================================= I/O */

async function loadAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  companyId: string,
  inFilter?: { column: string; values: string[] }
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase.from(table).select(columns).eq("company_id", companyId);
    if (inFilter) q = q.in(inFilter.column, inFilter.values);
    const { data, error } = await q.order("id", { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const OPEN_PO_STATUSES = ["Approved", "Sent", "Partially Received"];

export async function getProductionControlReport(
  supabase: SupabaseClient,
  companyId: string,
  params: { from: string; to: string; view: ProductionView; today?: string }
): Promise<ProductionControlReport> {
  const today = params.today || saDate(new Date().toISOString())!;
  const runs = await loadAll<RunRow>(supabase, "vyron_cost_production_runs", "*", companyId);
  const controlFieldsAvailable = runs.length === 0 || runs.some((r) => "planned_date" in r);

  const openIds = runs.filter((r) => !["Completed", "Cancelled", "Reversed"].includes(String(r.status))).map((r) => String(r.id));
  const runLines: RunLineRow[] = [];
  for (let i = 0; i < openIds.length; i += 100) {
    const chunk = openIds.slice(i, i + 100);
    runLines.push(
      ...(await loadAll<RunLineRow>(
        supabase,
        "vyron_cost_production_run_lines",
        "id, production_run_id, line_type, ingredient_id, stock_item_id, line_name, unit, planned_qty, unit_cost",
        companyId,
        { column: "production_run_id", values: chunk }
      ))
    );
  }
  // Missing-cost checks need lines of the period's completed runs too.
  const periodIds = runs
    .filter((r) => !openIds.includes(String(r.id)))
    .filter((r) => {
      const d = isoDate(r.planned_date) || saDate(r.created_at);
      return !!d && d >= params.from && d <= params.to;
    })
    .map((r) => String(r.id));
  for (let i = 0; i < periodIds.length; i += 100) {
    const chunk = periodIds.slice(i, i + 100);
    runLines.push(
      ...(await loadAll<RunLineRow>(
        supabase,
        "vyron_cost_production_run_lines",
        "id, production_run_id, line_type, ingredient_id, stock_item_id, line_name, unit, planned_qty, unit_cost",
        companyId,
        { column: "production_run_id", values: chunk }
      ))
    );
  }

  const [stockItems, products, bomReport] = await Promise.all([
    loadAll<StockItemRow>(supabase, "vyron_cost_stock_items", "id, entity_type, entity_id, description, unit, qty_on_hand", companyId),
    loadAll<ProductRow>(supabase, "vyron_cost_products", "id, product_name, sku, selling_price", companyId),
    getBomCompletenessReport(supabase, companyId),
  ]);

  const openPoLines: OpenPoLine[] = [];
  try {
    const pos = await loadAll<{ id: string; po_number: string; status: string; expected_date: string | null }>(
      supabase,
      "vyron_cost_purchase_orders",
      "id, po_number, status, expected_date",
      companyId,
      { column: "status", values: OPEN_PO_STATUSES }
    );
    const poById = new Map(pos.map((p) => [String(p.id), p]));
    for (let i = 0; i < pos.length; i += 100) {
      const chunk = pos.slice(i, i + 100).map((p) => String(p.id));
      const lines = await loadAll<{ purchase_order_id: string; ingredient_id: string | null; item_id: string | null; outstanding_qty: number | null; quantity: number | null; received_qty: number | null }>(
        supabase,
        "vyron_cost_purchase_order_lines",
        "id, purchase_order_id, ingredient_id, item_id, outstanding_qty, quantity, received_qty",
        companyId,
        { column: "purchase_order_id", values: chunk }
      );
      for (const l of lines) {
        const po = poById.get(String(l.purchase_order_id));
        const outstanding = l.outstanding_qty !== null && l.outstanding_qty !== undefined ? num(l.outstanding_qty) : Math.max(0, num(l.quantity) - num(l.received_qty));
        if (!po || outstanding <= 0) continue;
        openPoLines.push({ ingredient_id: l.ingredient_id, item_id: l.item_id, outstanding_qty: outstanding, po_number: po.po_number, status: po.status, expected_date: po.expected_date });
      }
    }
  } catch {
    // Purchasing data is supplementary: without it "on order" shows 0.
  }

  let wastage: WastageRow[] = [];
  try {
    wastage = await loadAll<WastageRow>(supabase, "vyron_cost_production_wastage", "id, production_run_id, waste_qty, waste_value", companyId);
  } catch {
    wastage = [];
  }

  const productCodes = new Map<string, string>();
  for (const r of bomReport.rows) if (r.productCode) productCodes.set(r.productId, r.productCode);

  return buildProductionControlReport({
    from: params.from,
    to: params.to,
    today,
    view: params.view,
    runs,
    runLines,
    stockItems,
    openPoLines,
    products,
    productCodes,
    wastage,
    bomRows: bomReport.rows,
    controlFieldsAvailable,
  });
}
