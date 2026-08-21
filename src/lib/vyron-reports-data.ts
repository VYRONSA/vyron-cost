import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getCustomerGpReport, type CustomerGpReport } from "@/lib/vyron-customer-gp-reporting";

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
