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
