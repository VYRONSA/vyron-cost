import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * VOLORA — historical inflation management.
 *
 * Supplier price history (vyron_supplier_price_history) records each invoice price against the
 * previous one. Cost prices captured before the agreed starting point (October 2026) are known to
 * be wrong, so any movement measured against them is wrong too, and it carries forward into later
 * inflation figures.
 *
 * The control is an INFLATION BASELINE DATE. With a baseline set:
 *  - rows dated before it are excluded from inflation (the rows themselves are never changed or
 *    deleted — invoice costs and history stay exactly as captured);
 *  - each item's inflation is re-based on its first purchase on or after the baseline.
 * Items with no purchase since the baseline have no reliable basis: they are listed as needing
 * corrected source cost data, never given an invented cost.
 *
 * The baseline is stored as append-only events in the inventory audit log
 * (event types below), so every set / change / removal keeps who, when, why and the impact shown
 * before it was committed. No schema change is needed.
 */

export const AGREED_INFLATION_BASELINE = "2026-10-01";
const SET_EVENT = "inflation_baseline_set";
const REMOVE_EVENT = "inflation_baseline_removed";

export class InflationBaselineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PriceHistoryInput = {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  item_description: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string | null;
  previous_price: number | null;
  new_price: number | null;
  change_percent: number | null;
};

export type InflationItemStatus = "REBASED" | "UNCHANGED" | "SINGLE_PURCHASE" | "NO_RELIABLE_BASIS";
export type InflationItem = {
  key: string;
  entityType: string;
  entityId: string | null;
  name: string;
  supplierName: string;
  rowsBefore: number;
  rowsAfter: number;
  lastPriceBefore: number | null;
  lastDateBefore: string | null;
  basisPrice: number | null;
  basisDate: string | null;
  basisInvoice: string | null;
  latestPrice: number | null;
  latestDate: string | null;
  /** Inflation as currently recorded: latest price against the first recorded previous price in the history. */
  recordedPct: number | null;
  /** Inflation re-based on the first purchase on/after the baseline. */
  rebasedPct: number | null;
  status: InflationItemStatus;
};

export type InflationReview = {
  baseline: string;
  items: InflationItem[];
  summary: {
    items: number;
    rowsExcluded: number;
    itemsChanged: number;
    itemsNeedingData: number;
    averageRecordedPct: number | null;
    averageRebasedPct: number | null;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const rowDate = (r: Pick<PriceHistoryInput, "invoice_date" | "created_at">) => String(r.invoice_date || r.created_at || "").slice(0, 10);
const pct = (from: number | null, to: number | null) => (from && from > 0 && to !== null ? r2(((to - from) / from) * 100) : null);
const mean = (values: Array<number | null>) => {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? r2(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Pure: per item, recorded vs re-based inflation for a baseline date. */
export function buildInflationReview(rows: PriceHistoryInput[], baseline: string): InflationReview {
  const groups = new Map<string, PriceHistoryInput[]>();
  for (const r of rows) {
    const name = String(r.entity_name || r.item_description || "").trim();
    const key = r.entity_id ? `${r.entity_type}:${r.entity_id}` : `${r.entity_type}:${name.toLowerCase()}|${String(r.supplier_name || "").toLowerCase()}`;
    if (!r.entity_id && !name) continue;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const items: InflationItem[] = [];
  for (const [key, list] of groups) {
    const ordered = [...list].sort((a, b) => rowDate(a).localeCompare(rowDate(b)) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const before = ordered.filter((r) => rowDate(r) < baseline);
    const after = ordered.filter((r) => rowDate(r) >= baseline);
    const first = ordered[0];
    const latest = ordered[ordered.length - 1];
    const basis = after[0] || null;
    const latestAfter = after[after.length - 1] || null;
    const recordedStart = first.previous_price !== null && Number(first.previous_price) > 0 ? Number(first.previous_price) : Number(first.new_price);
    const recordedPct = ordered.length > 1 || (first.previous_price !== null && Number(first.previous_price) > 0) ? pct(recordedStart, Number(latest.new_price)) : null;
    const rebasedPct = basis && latestAfter && after.length > 1 ? pct(Number(basis.new_price), Number(latestAfter.new_price)) : null;
    let status: InflationItemStatus;
    if (!after.length) status = "NO_RELIABLE_BASIS";
    else if (after.length === 1) status = "SINGLE_PURCHASE";
    else status = before.length || recordedPct !== rebasedPct ? "REBASED" : "UNCHANGED";
    items.push({
      key,
      entityType: String(first.entity_type || "—"),
      entityId: first.entity_id,
      name: String(first.entity_name || first.item_description || "—"),
      supplierName: String(latest.supplier_name || "—"),
      rowsBefore: before.length,
      rowsAfter: after.length,
      lastPriceBefore: before.length ? Number(before[before.length - 1].new_price) : null,
      lastDateBefore: before.length ? rowDate(before[before.length - 1]) : null,
      basisPrice: basis ? Number(basis.new_price) : null,
      basisDate: basis ? rowDate(basis) : null,
      basisInvoice: basis?.invoice_number || null,
      latestPrice: latest.new_price === null ? null : Number(latest.new_price),
      latestDate: rowDate(latest),
      recordedPct,
      rebasedPct,
      status,
    });
  }
  items.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
  return {
    baseline,
    items,
    summary: {
      items: items.length,
      rowsExcluded: items.reduce((s, i) => s + i.rowsBefore, 0),
      itemsChanged: items.filter((i) => i.recordedPct !== i.rebasedPct).length,
      itemsNeedingData: items.filter((i) => i.status === "NO_RELIABLE_BASIS").length,
      averageRecordedPct: mean(items.map((i) => i.recordedPct)),
      averageRebasedPct: mean(items.map((i) => i.rebasedPct)),
    },
  };
}

export type BaselineEvent = { id: string; event_type: string; actor: string; new_value: string | null; old_value: string | null; detail: string | null; created_at: string; metadata: Record<string, unknown> };

export async function listInflationBaselineEvents(supabase: SupabaseClient, companyId: string): Promise<BaselineEvent[]> {
  const { data, error } = await supabase
    .from("vyron_inventory_audit_log")
    .select("id, event_type, actor, new_value, old_value, detail, created_at, metadata")
    .eq("company_id", companyId)
    .in("event_type", [SET_EVENT, REMOVE_EVENT])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as BaselineEvent[];
}

/** The committed baseline, or null when none is set (inflation then uses the full history, as before). */
export async function getInflationBaseline(supabase: SupabaseClient, companyId: string): Promise<string | null> {
  const [latest] = await listInflationBaselineEvents(supabase, companyId);
  if (!latest || latest.event_type === REMOVE_EVENT) return null;
  return isIsoDay(latest.new_value) ? latest.new_value : null;
}

export async function loadPriceHistoryForInflation(supabase: SupabaseClient, companyId: string): Promise<PriceHistoryInput[]> {
  const out: PriceHistoryInput[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await supabase
      .from("vyron_supplier_price_history")
      .select("id, entity_type, entity_id, entity_name, item_description, supplier_name, invoice_number, invoice_date, created_at, previous_price, new_price, change_percent")
      .eq("tenant_id", companyId)
      .eq("is_demo", false)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as PriceHistoryInput[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function commitInflationBaseline(
  supabase: SupabaseClient,
  companyId: string,
  input: { action: "set" | "remove"; baseline?: string; reason: string; actor: string }
) {
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new InflationBaselineError("Give a reason of at least 10 characters.");
  const current = await getInflationBaseline(supabase, companyId);
  let summary: InflationReview["summary"] | null = null;
  if (input.action === "set") {
    if (!isIsoDay(input.baseline)) throw new InflationBaselineError("Baseline must be a valid date (YYYY-MM-DD).");
    if (current === input.baseline) throw new InflationBaselineError(`The baseline is already ${current}.`);
    summary = buildInflationReview(await loadPriceHistoryForInflation(supabase, companyId), input.baseline).summary;
  } else if (!current) throw new InflationBaselineError("No baseline is set.");
  const { error } = await supabase.from("vyron_inventory_audit_log").insert({
    company_id: companyId,
    stock_item_id: null,
    event_type: input.action === "set" ? SET_EVENT : REMOVE_EVENT,
    actor: input.actor,
    field_name: "inflation_baseline_date",
    old_value: current,
    new_value: input.action === "set" ? input.baseline : null,
    detail:
      input.action === "set"
        ? `Inflation baseline ${current ? `changed from ${current} to` : "set to"} ${input.baseline}: ${summary?.rowsExcluded ?? 0} earlier price row(s) excluded from inflation (not deleted). Reason: ${reason}`
        : `Inflation baseline ${current} removed: inflation uses the full price history again. Reason: ${reason}`,
    reference_type: "inflation_baseline",
    reference_id: null,
    metadata: { reason, impactShownBeforeCommit: summary },
  });
  if (error) throw new Error(error.message);
  return { ok: true as const, baseline: input.action === "set" ? input.baseline! : null, previous: current, summary };
}
