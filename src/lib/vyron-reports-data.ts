import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getCustomerGpReport, type CustomerGpReport } from "@/lib/vyron-customer-gp-reporting";
import { getBomCompletenessReport, type BomCompletenessReport } from "@/lib/vyron-bom-completeness";
import { buildReorderReport, type ReorderReport } from "@/lib/vyron-reorder-report";
import { listSupplierInvoiceRegister } from "@/lib/vyron-supplier-invoices";
import {
  buildPeriodBuckets,
  isCountedPurchase,
  mtdWindows,
  rankFastMovers,
  totalsOf,
  type FastMover,
  type Granularity,
  type PeriodBucket,
  type PurchaseInvoiceInput,
  type SalesInvoiceInput,
} from "@/lib/vyron-period-performance";
import {
  buildFinishedGoodsDashboard,
  ledgerOrder,
  type FgDashboard,
  type FgLedgerInput,
  type FgProductionRunInput,
  type FgRow,
  type FgStockItemInput,
} from "@/lib/vyron-finished-goods-dashboard";

/**
 * Server data for the Reports centre.
 *
 * The sales, stock valuation and manufacturing reports previously rendered
 * static fixtures out of vyron-cost/manufacturing-data — four invented customer
 * invoices, twenty invented stock balances and three invented batches. They
 * showed the same figures to every tenant regardless of the workspace, which is
 * indefensible on a client-facing report. Each now reads the real, company
 * scoped tables through the existing data layers.
 *
 * Every function resolves the company from the active workspace and returns an
 * explicit `error` string instead of throwing, so a report renders its error
 * state once rather than surfacing an unhandled rejection.
 */

export type ReportLoad<T> = { data: T; error: string | null; companyId: string | null };

async function scope() {
  if (!isSupabaseServiceRoleConfigured()) {
    return { supabase: null, companyId: null, error: "Reporting service is not configured." };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { supabase: null, companyId: null, error: "Reporting service is unavailable." };
  const companyId = await getWorkspaceCompanyId();
  if (!companyId) return { supabase, companyId: null, error: "No active workspace company. Select a workspace first." };
  return { supabase, companyId, error: null as string | null };
}

/* ------------------------------------------------------------------ sales */

export async function loadSalesGpReport(filters: { from?: string; to?: string } = {}): Promise<
  ReportLoad<CustomerGpReport | null>
> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: null, error, companyId };
  try {
    const report = await getCustomerGpReport(supabase, companyId, {
      from: filters.from,
      to: filters.to,
    });
    return { data: report, error: null, companyId };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Sales report failed.", companyId };
  }
}

/* -------------------------------------------------------- stock valuation */

export type StockValuationRow = {
  id: string;
  itemCode: string;
  description: string;
  entityType: string;
  unit: string;
  qtyOnHand: number;
  averageCost: number;
  inventoryValue: number;
  stockStatus: string;
  lastMovementAt: string | null;
};

export async function loadStockValuation(): Promise<ReportLoad<StockValuationRow[]>> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: [], error, companyId };
  try {
    const { data, error: qErr } = await supabase
      .from("vyron_cost_stock_items")
      .select(
        "id, item_code, description, entity_type, unit, qty_on_hand, average_cost, current_cost, inventory_value, stock_status, last_movement_at"
      )
      .eq("company_id", companyId)
      .order("description", { ascending: true })
      .limit(5000);
    if (qErr) throw new Error(qErr.message);

    const rows: StockValuationRow[] = (data || []).map((r) => {
      const qty = Number(r.qty_on_hand) || 0;
      // Prefer the stored valuation; fall back to qty x cost only when the
      // stored value is absent, never overriding a posted valuation.
      const cost = Number(r.average_cost) || Number(r.current_cost) || 0;
      const stored = r.inventory_value === null || r.inventory_value === undefined ? null : Number(r.inventory_value);
      return {
        id: String(r.id),
        itemCode: String(r.item_code || "—"),
        description: String(r.description || "—"),
        entityType: String(r.entity_type || "—"),
        unit: String(r.unit || "—"),
        qtyOnHand: qty,
        averageCost: cost,
        inventoryValue: stored !== null ? stored : Math.round(qty * cost * 100) / 100,
        stockStatus: String(r.stock_status || "—"),
        lastMovementAt: r.last_movement_at ? String(r.last_movement_at) : null,
      };
    });
    return { data: rows, error: null, companyId };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : "Stock valuation failed.", companyId };
  }
}

/* ---------------------------------------------------------- manufacturing */

export type ManufacturingBatchRow = {
  id: string;
  batchNumber: string;
  productName: string;
  status: string;
  batchDate: string | null;
  plannedQty: number;
  actualQty: number;
  varianceQty: number;
  batchCost: number;
  unitCost: number;
};

export async function loadManufacturingBatches(
  filters: { from?: string; to?: string } = {}
): Promise<ReportLoad<ManufacturingBatchRow[]>> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: [], error, companyId };
  try {
    let query = supabase
      .from("vyron_manufacturing_batches")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (filters.from) query = query.gte("batch_date", filters.from);
    if (filters.to) query = query.lte("batch_date", filters.to);

    const { data, error: qErr } = await query;
    if (qErr) throw new Error(qErr.message);

    const rows: ManufacturingBatchRow[] = (data || []).map((r) => {
      const planned = Number(r.planned_quantity ?? r.planned_qty ?? 0) || 0;
      const actual = Number(r.actual_quantity ?? r.actual_qty ?? r.quantity_produced ?? 0) || 0;
      const batchCost = Number(r.total_cost ?? r.batch_cost ?? 0) || 0;
      return {
        id: String(r.id),
        batchNumber: String(r.batch_number || r.reference || "—"),
        productName: String(r.product_name || "—"),
        status: String(r.status || "—"),
        batchDate: r.batch_date ? String(r.batch_date).slice(0, 10) : null,
        plannedQty: planned,
        actualQty: actual,
        varianceQty: Math.round((actual - planned) * 1000) / 1000,
        batchCost,
        unitCost: actual > 0 ? Math.round((batchCost / actual) * 100) / 100 : 0,
      };
    });
    return { data: rows, error: null, companyId };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : "Manufacturing report failed.", companyId };
  }
}

/* ------------------------------------------------- finished goods BOM */

/**
 * Finished Goods — BOM Completeness.
 *
 * Company resolved from the active workspace exactly like every other report
 * here, so the analysis can only ever see this tenant's products, BOMs, BOM
 * lines, ingredients and sales.
 */
/** Low stock & minimum order levels for the active workspace's company. */
export async function loadReorderReport(): Promise<ReportLoad<ReorderReport | null>> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: null, error, companyId };
  try {
    return { data: await buildReorderReport(supabase, companyId), error: null, companyId };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Reorder report failed.", companyId };
  }
}

export async function loadBomCompletenessReport(
  filters: { from?: string; to?: string } = {}
): Promise<ReportLoad<BomCompletenessReport | null>> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: null, error, companyId };
  try {
    const report = await getBomCompletenessReport(supabase, companyId, filters);
    return { data: report, error: null, companyId };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "BOM completeness report failed.",
      companyId,
    };
  }
}

/* ------------------------------------------------- period performance */

export type PeriodPerformance = {
  range: { from: string; to: string };
  granularity: Granularity;
  buckets: PeriodBucket[];
  totals: ReturnType<typeof totalsOf>;
  mtd: {
    current: { from: string; to: string } & ReturnType<typeof totalsOf>;
    previous: { from: string; to: string } & ReturnType<typeof totalsOf>;
  };
  fastMovers: FastMover[];
  /** Purchase invoices in the range with no ex-VAT subtotal recorded (counted as R0). */
  purchasesWithoutSubtotal: number;
  /** Sold lines in the range with no measured cost: GP for those lines is not real. */
  costWarnings: CustomerGpReport["costWarnings"] | undefined;
  salesInvoices: SalesInvoiceInput[];
  purchaseInvoices: PurchaseInvoiceInput[];
};

export async function loadPeriodPerformance(filters: { from: string; to: string; granularity: Granularity; today: string }): Promise<ReportLoad<PeriodPerformance | null>> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: null, error, companyId };
  try {
    const mtd = mtdWindows(filters.today);
    const [report, mtdReport, prevReport, register] = await Promise.all([
      getCustomerGpReport(supabase, companyId, { from: filters.from, to: filters.to }),
      getCustomerGpReport(supabase, companyId, { from: mtd.current.from, to: mtd.current.to }),
      getCustomerGpReport(supabase, companyId, { from: mtd.previous.from, to: mtd.previous.to }),
      listSupplierInvoiceRegister(supabase, companyId),
    ]);

    const toSales = (r: CustomerGpReport): SalesInvoiceInput[] =>
      r.byInvoice.map((i) => ({
        invoiceId: i.invoiceId,
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate,
        customerName: i.customerName,
        revenue: i.revenue,
        cost: i.cost,
        gp: i.gp,
        qtySold: i.qtySold,
      }));
    const purchases: PurchaseInvoiceInput[] = register.invoices.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      supplierName: row.supplier_name || "—",
      invoiceDate: row.invoice_date,
      status: row.status,
      subtotal: row.subtotal,
      href: row.href,
    }));

    const sales = toSales(report);
    const buckets = buildPeriodBuckets(sales, purchases, filters.granularity, filters);
    const window = (r: CustomerGpReport, w: { from: string; to: string }) => ({
      ...w,
      ...totalsOf(buildPeriodBuckets(toSales(r), purchases, "month", w)),
    });

    const productIds = report.byProduct.map((p) => p.productId).filter((id): id is string => Boolean(id));
    const codes = new Map<string, string>();
    for (let i = 0; i < productIds.length; i += 200) {
      const { data, error: codeError } = await supabase
        .from("vyron_cost_products")
        .select("id, sku")
        .eq("company_id", companyId)
        .in("id", productIds.slice(i, i + 200));
      if (codeError) throw new Error(codeError.message);
      for (const row of data || []) if (row.sku) codes.set(String(row.id), String(row.sku));
    }

    const inRange = (d: string | null) => Boolean(d) && String(d).slice(0, 10) >= filters.from && String(d).slice(0, 10) <= filters.to;
    const rangePurchases = purchases.filter((p) => inRange(p.invoiceDate) && isCountedPurchase(p.status));

    return {
      data: {
        range: { from: filters.from, to: filters.to },
        granularity: filters.granularity,
        buckets,
        totals: totalsOf(buckets),
        mtd: { current: window(mtdReport, mtd.current), previous: window(prevReport, mtd.previous) },
        fastMovers: rankFastMovers(report.byProduct, codes, 10),
        purchasesWithoutSubtotal: rangePurchases.filter((p) => p.subtotal === null || p.subtotal === undefined).length,
        costWarnings: report.costWarnings,
        salesInvoices: sales,
        purchaseInvoices: rangePurchases,
      },
      error: null,
      companyId,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Performance report failed.", companyId };
  }
}

/* ------------------------------------------------- finished goods dashboard */

export type FinishedGoodsDashboardLoad = FgDashboard & {
  focus: { row: FgRow; movements: FgLedgerInput[] } | null;
  runsInRange: FgProductionRunInput[];
};

/** Page through a Supabase select; PostgREST caps a single response at 1000 rows. */
async function selectAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let offset = 0; offset < 200000; offset += 1000) {
    const { data, error } = await build(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadFinishedGoodsDashboard(filters: { from: string; to: string; focusId?: string | null }): Promise<
  ReportLoad<FinishedGoodsDashboardLoad | null>
> {
  const { supabase, companyId, error } = await scope();
  if (!supabase || !companyId) return { data: null, error, companyId };
  try {
    const itemRows = await selectAllPages<Record<string, unknown>>((a, b) =>
      supabase
        .from("vyron_cost_stock_items")
        .select("id, item_code, description, category, unit, qty_on_hand, average_cost, current_cost, inventory_value, min_level, stock_status, is_active, last_movement_at, entity_id")
        .eq("company_id", companyId)
        .eq("entity_type", "finished_goods")
        .order("description", { ascending: true })
        .range(a, b)
    );
    const items: FgStockItemInput[] = itemRows.map((r) => ({
      id: String(r.id),
      itemCode: String(r.item_code || "—"),
      description: String(r.description || "—"),
      category: String(r.category || "Uncategorised"),
      unit: String(r.unit || "each"),
      qtyOnHand: Number(r.qty_on_hand) || 0,
      averageCost: Number(r.average_cost) || Number(r.current_cost) || 0,
      inventoryValue: r.inventory_value === null || r.inventory_value === undefined ? null : Number(r.inventory_value),
      minLevel: Number(r.min_level) || 0,
      stockStatus: String(r.stock_status || "—"),
      isActive: r.is_active !== false,
      lastMovementAt: r.last_movement_at ? String(r.last_movement_at) : null,
    }));
    const itemIds = new Set(items.map((i) => i.id));
    const productToItem = new Map(itemRows.filter((r) => r.entity_id).map((r) => [String(r.entity_id), String(r.id)]));

    // Ledger rows for finished goods up to the end of the range (opening balance needs history before `from`).
    const ledgerRows = await selectAllPages<Record<string, unknown>>((a, b) =>
      supabase
        .from("vyron_cost_stock_ledger")
        .select("id, stock_item_id, movement_date, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value, reference_type, reference_id, reference_label, actor, created_at, vyron_cost_stock_items!inner(entity_type)")
        .eq("company_id", companyId)
        .eq("vyron_cost_stock_items.entity_type", "finished_goods")
        .lte("movement_date", `${filters.to}T23:59:59.999+02:00`)
        .order("movement_date", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b)
    );
    const ledger: FgLedgerInput[] = ledgerRows
      .filter((l) => itemIds.has(String(l.stock_item_id)))
      .map((l) => ({
        id: String(l.id),
        stockItemId: String(l.stock_item_id),
        movementDate: sastDay(String(l.movement_date)),
        movementType: String(l.movement_type || "—"),
        quantityIn: Number(l.quantity_in) || 0,
        quantityOut: Number(l.quantity_out) || 0,
        balanceAfter: Number(l.balance_after) || 0,
        unitCost: Number(l.unit_cost) || 0,
        value: Number(l.value) || 0,
        referenceType: l.reference_type ? String(l.reference_type) : null,
        referenceId: l.reference_id ? String(l.reference_id) : null,
        referenceLabel: l.reference_label ? String(l.reference_label) : null,
        actor: l.actor ? String(l.actor) : null,
        createdAt: l.created_at ? String(l.created_at) : null,
      }));

    const runRows = await selectAllPages<Record<string, unknown>>((a, b) =>
      supabase
        .from("vyron_cost_production_runs")
        .select("id, run_number, product_id, product_name_snapshot, bom_name_snapshot, status, planned_qty, actual_qty, completed_at, created_at")
        .eq("company_id", companyId)
        .lte("created_at", `${filters.to}T23:59:59.999+02:00`)
        .order("created_at", { ascending: false })
        .range(a, b)
    );
    const runs: FgProductionRunInput[] = runRows
      .map((r) => ({
        id: String(r.id),
        runNumber: String(r.run_number || "—"),
        productId: r.product_id ? String(r.product_id) : null,
        productName: String(r.product_name_snapshot || r.bom_name_snapshot || "—"),
        status: String(r.status || "—"),
        plannedQty: Number(r.planned_qty) || 0,
        actualQty: Number(r.actual_qty) || 0,
        date: sastDay(String(r.completed_at || r.created_at)),
      }))
      .filter((r) => r.date >= filters.from && r.date <= filters.to);

    const dashboard = buildFinishedGoodsDashboard({ from: filters.from, to: filters.to, items, ledger, runs });
    let focus: FinishedGoodsDashboardLoad["focus"] = null;
    const focusRow = filters.focusId ? dashboard.rows.find((r) => r.id === filters.focusId) : null;
    if (focusRow) {
      const movements = ledger
        .filter((l) => l.stockItemId === focusRow.id && l.movementDate >= filters.from)
        .sort(ledgerOrder)
        .reverse();
      focus = { row: focusRow, movements };
    }
    const focusProduct = focusRow ? [...productToItem.entries()].find(([, itemId]) => itemId === focusRow.id)?.[0] : null;
    return {
      data: {
        ...dashboard,
        focus,
        runsInRange: focusRow ? runs.filter((r) => r.productId && r.productId === focusProduct) : runs,
      },
      error: null,
      companyId,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Finished goods dashboard failed.", companyId };
  }
}

/** Calendar day in South Africa (UTC+2, no DST) for a timestamp. */
function sastDay(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso || "").slice(0, 10);
  return new Date(t + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
