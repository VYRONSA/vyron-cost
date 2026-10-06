import type { SupabaseClient } from "@supabase/supabase-js";
import { getInventorySettings } from "@/lib/vyron-inventory";
import { checkProductionMinimums } from "@/lib/vyron-production-minimums";
import { listMinimumLevelStatus } from "@/lib/vyron-stock-minimums";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { listSupplierInvoiceRegister } from "@/lib/vyron-supplier-invoices";

/**
 * VOLORA — "Attention Required": what management should look at, from the company's own data.
 *
 * Every item is a count of real records and links to where they are. An item appears only when its
 * count is above zero, and a warning that depends on a company setting (minimum levels, the
 * expected production interval, price lists) appears only once the company has configured it —
 * nothing is assumed. Read-only.
 */

export type AttentionSeverity = "critical" | "warning" | "info";
export type AttentionArea = "STOCK" | "SUPPLIER_INVOICES" | "PRODUCTION" | "SALES";
export type AttentionItem = { key: string; area: AttentionArea; severity: AttentionSeverity; count: number; label: string; href: string };

export type LastProduction = {
  runId: string;
  runNumber: string;
  completedAt: string;
  completedBy: string | null;
  productName: string | null;
  quantity: number;
};

export type ProductionActivity = {
  last: LastProduction | null;
  unitsToday: number;
  runsToday: number;
  hoursSinceLast: number | null;
  /** The company's expected interval between runs; null = not configured. */
  expectedIntervalHours: number | null;
  /** Locations are not recorded on production runs; the activity is company-wide. */
  byLocation: null;
};

export type AttentionCentre = { items: AttentionItem[]; production: ProductionActivity; generatedAt: string };

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
const OPEN_RUN_STATUSES = ["Planned", "Approved", "In Production"];

/** Today's date in South Africa (the application's operating time zone). */
function todayInSouthAfrica(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function getProductionActivity(supabase: SupabaseClient, companyId: string, now = new Date()): Promise<ProductionActivity> {
  const settings = await getInventorySettings(supabase, companyId);
  const { data: lastRows, error } = await supabase
    .from("vyron_cost_production_runs")
    .select("id, run_number, completed_at, completed_by, actual_qty, product_name_snapshot, product_id")
    .eq("company_id", companyId)
    .eq("status", "Completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const lastRow = (lastRows || [])[0];
  let last: LastProduction | null = null;
  if (lastRow) {
    let productName: string | null = null;
    if (lastRow.product_name_snapshot) productName = String(lastRow.product_name_snapshot);
    else if (lastRow.product_id) {
      const { data: product } = await supabase.from("vyron_cost_products").select("product_name").eq("id", lastRow.product_id).eq("company_id", companyId).maybeSingle();
      productName = (product?.product_name as string) ?? null;
    }
    last = {
      runId: String(lastRow.id),
      runNumber: String(lastRow.run_number || ""),
      completedAt: String(lastRow.completed_at),
      completedBy: lastRow.completed_by ? String(lastRow.completed_by) : null,
      productName,
      quantity: Number(lastRow.actual_qty || 0),
    };
  }

  // Runs completed on today's South African date.
  const today = todayInSouthAfrica(now);
  const since = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
  const recent = await readAllPages<{ completed_at: string; actual_qty: number }>((from, to) =>
    supabase.from("vyron_cost_production_runs").select("completed_at, actual_qty").eq("company_id", companyId).eq("status", "Completed").gte("completed_at", since).order("completed_at", { ascending: true }).range(from, to)
  );
  const todays = recent.filter((r) => todayInSouthAfrica(new Date(r.completed_at)) === today);

  return {
    last,
    unitsToday: Math.round(todays.reduce((t, r) => t + Number(r.actual_qty || 0), 0) * 1e4) / 1e4,
    runsToday: todays.length,
    // Exact (not rounded): the overdue check compares it with the configured interval.
    hoursSinceLast: last ? (now.getTime() - Date.parse(last.completedAt)) / 3600000 : null,
    expectedIntervalHours: settings.expectedProductionIntervalHours,
    byLocation: null,
  };
}

export async function getAttentionCentre(supabase: SupabaseClient, companyId: string, now = new Date()): Promise<AttentionCentre> {
  const items: AttentionItem[] = [];
  const add = (item: AttentionItem) => {
    if (item.count > 0) items.push(item);
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // STOCK — configured minimum levels.
  const levels = await listMinimumLevelStatus(supabase, companyId);
  const critical = levels.filter((l) => l.status === "CRITICAL").length;
  const below = levels.filter((l) => l.status === "BELOW_MINIMUM").length;
  const near = levels.filter((l) => l.status === "WARNING").length;
  add({ key: "stock.critical", area: "STOCK", severity: "critical", count: critical, label: plural(critical, "stock item at critical level", "stock items at critical level"), href: "/inventory/minimum-levels" });
  add({ key: "stock.below_minimum", area: "STOCK", severity: "critical", count: below, label: plural(below, "stock item below minimum", "stock items below minimum"), href: "/inventory/minimum-levels" });
  add({ key: "stock.near_minimum", area: "STOCK", severity: "warning", count: near, label: plural(near, "stock item approaching its minimum", "stock items approaching their minimum"), href: "/inventory/minimum-levels" });

  // STOCK — counts awaiting approval / posting that carry variances.
  const { data: openCounts, error: countsError } = await supabase
    .from("vyron_cost_stock_counts")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["Submitted", "Approved"]);
  if (countsError) throw new Error(countsError.message);
  let countsWithVariance = 0;
  if (openCounts?.length) {
    const { data: varianceLines, error } = await supabase
      .from("vyron_cost_stock_count_lines")
      .select("stock_count_id, variance_qty")
      .eq("company_id", companyId)
      .in("stock_count_id", openCounts.map((c) => c.id));
    if (error) throw new Error(error.message);
    countsWithVariance = new Set((varianceLines || []).filter((l) => Math.abs(Number(l.variance_qty || 0)) >= 0.0001).map((l) => String(l.stock_count_id))).size;
  }
  add({ key: "stock.count_variances", area: "STOCK", severity: "warning", count: countsWithVariance, label: plural(countsWithVariance, "stock take with variances awaiting approval", "stock takes with variances awaiting approval"), href: "/inventory/counts" });

  // SUPPLIER INVOICES — duplicates in the register; the latest reconciliation per supplier.
  const register = await listSupplierInvoiceRegister(supabase, companyId);
  const duplicateGroups = new Set(
    register.invoices.filter((r) => r.duplicate_risk).map((r) => `${String(r.supplier_name || "").trim().toLowerCase()}|${String(r.invoice_number || "").trim().toLowerCase()}`)
  ).size;
  add({ key: "supplier.duplicates", area: "SUPPLIER_INVOICES", severity: "warning", count: duplicateGroups, label: plural(duplicateGroups, "supplier invoice captured more than once", "supplier invoices captured more than once"), href: "/supplier-invoices" });

  const { data: recons, error: reconError } = await supabase
    .from("vyron_supplier_reconciliations")
    .select("supplier_name, created_at, summary")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (reconError && !/does not exist|could not find/i.test(reconError.message)) throw new Error(reconError.message);
  const latestBySupplier = new Map<string, { missing: number; differences: number }>();
  for (const r of recons || []) {
    const key = String(r.supplier_name || "").trim().toLowerCase();
    if (latestBySupplier.has(key)) continue;
    const s = (r.summary || {}) as Record<string, number>;
    latestBySupplier.set(key, { missing: Number(s.missing || 0), differences: Number(s.totalDifferences || 0) + Number(s.vatDifferences || 0) });
  }
  const missing = [...latestBySupplier.values()].reduce((t, v) => t + v.missing, 0);
  const differences = [...latestBySupplier.values()].reduce((t, v) => t + v.differences, 0);
  add({ key: "supplier.missing", area: "SUPPLIER_INVOICES", severity: "critical", count: missing, label: plural(missing, "supplier invoice missing in VOLORA", "supplier invoices missing in VOLORA"), href: "/supplier-invoices/reconciliation" });
  add({ key: "supplier.differences", area: "SUPPLIER_INVOICES", severity: "warning", count: differences, label: plural(differences, "supplier invoice difference", "supplier invoice differences"), href: "/supplier-invoices/reconciliation" });

  // PRODUCTION — open runs that would take stock below a configured minimum.
  if (levels.length) {
    const { data: openRuns, error: runsError } = await supabase
      .from("vyron_cost_production_runs")
      .select("id")
      .eq("company_id", companyId)
      .in("status", OPEN_RUN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(50);
    if (runsError) throw new Error(runsError.message);
    let runsWithWarnings = 0;
    let runsBlocked = 0;
    for (const run of openRuns || []) {
      const check = await checkProductionMinimums(supabase, companyId, String(run.id));
      if (check.blocking.length) runsBlocked++;
      else if (check.warnings.length) runsWithWarnings++;
    }
    add({ key: "production.blocked", area: "PRODUCTION", severity: "critical", count: runsBlocked, label: plural(runsBlocked, "production run blocked by a minimum level", "production runs blocked by minimum levels"), href: "/manufacturing/runs" });
    add({ key: "production.minimum_warnings", area: "PRODUCTION", severity: "warning", count: runsWithWarnings, label: plural(runsWithWarnings, "production run would take stock below minimum", "production runs would take stock below minimum"), href: "/manufacturing/runs" });
  }

  // PRODUCTION — cadence, only when the company has set an expected interval.
  const production = await getProductionActivity(supabase, companyId, now);
  if (production.expectedIntervalHours && production.expectedIntervalHours > 0) {
    const interval = production.expectedIntervalHours;
    if (!production.last) {
      add({ key: "production.none", area: "PRODUCTION", severity: "warning", count: 1, label: "No production has been processed yet", href: "/manufacturing/runs" });
    } else if ((production.hoursSinceLast ?? 0) > interval) {
      const hours = production.hoursSinceLast ?? 0;
      const ago = hours >= 48 ? `${Math.floor(hours / 24)} days ago` : hours >= 1 ? `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? "" : "s"} ago` : (() => { const m = Math.max(1, Math.floor(hours * 60)); return `${m} minute${m === 1 ? "" : "s"} ago`; })();
      add({ key: "production.overdue", area: "PRODUCTION", severity: hours > interval * 2 ? "critical" : "warning", count: 1, label: `Last production processed ${ago}`, href: "/manufacturing/runs" });
    }
  }

  // SALES — customers without a price list, only where the company prices by lists and has no default list.
  const { data: lists, error: listsError } = await supabase.from("vyron_customer_price_lists").select("*").eq("company_id", companyId).eq("status", "Active");
  if (listsError) throw new Error(listsError.message);
  const hasDefault = (lists || []).some((l) => (l as { is_company_default?: boolean }).is_company_default === true);
  if ((lists || []).length && !hasDefault) {
    const customers = await readAllPages<{ id: string }>((from, to) =>
      supabase.from("vyron_customers").select("id").eq("company_id", companyId).neq("status", "Inactive").order("id", { ascending: true }).range(from, to)
    );
    const assignments = await readAllPages<{ customer_id: string }>((from, to) =>
      supabase.from("vyron_customer_price_list_assignments").select("customer_id").eq("company_id", companyId).eq("status", "Active").order("customer_id", { ascending: true }).range(from, to)
    );
    const assigned = new Set(assignments.map((a) => String(a.customer_id)));
    const without = customers.filter((c) => !assigned.has(String(c.id))).length;
    add({ key: "sales.customers_without_price_list", area: "SALES", severity: "info", count: without, label: plural(without, "customer without a price list (no company default list set)", "customers without a price list (no company default list set)"), href: "/customer-price-lists" });
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
  return { items, production, generatedAt: now.toISOString() };
}
