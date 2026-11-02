import type { SupabaseClient } from "@supabase/supabase-js";
import { listMinimumLevelStatus, type MinimumStatus } from "@/lib/vyron-stock-minimums";
import { readAllIn, readAllPages } from "@/lib/vyron-supabase-paging";

/**
 * Low stock / minimum order level report (Kingdom Foods, 2026-11).
 *
 * One row per stock item the company has given a minimum level
 * (vyron_stock_minimum_levels — an item without one is never reported):
 *
 *   on hand          the item's current balance
 *   on order         outstanding quantity on purchase orders already placed
 *                    (Approved, Sent, Partially Received)
 *   needs ordering   on hand + on order is below the minimum
 *   reorder qty      enough to bring on hand + on order up to the warning
 *                    level (or the minimum when no warning level is set)
 *   reason           why — in words a buyer can act on
 *   supplier         who to order from: the ingredient's supplier on its
 *                    master record, else the supplier of the item's most
 *                    recent purchase order, else the stock item's supplier;
 *                    finished goods are made in-house (their BOM)
 *
 * Stock already on order is counted, so an item that is low but covered by an
 * open purchase order is not ordered twice.
 */
export const ON_ORDER_PO_STATUSES = ["Approved", "Sent", "Partially Received", "Ordered"];

export type ReorderRow = {
  stockItemId: string;
  itemCode: string | null;
  description: string;
  unit: string | null;
  onHand: number;
  onOrder: number;
  openPurchaseOrders: string[];
  minimum: number;
  warning: number | null;
  critical: number | null;
  status: MinimumStatus;
  supplier: string | null;
  supplierSource: "ingredient" | "last purchase order" | "stock item" | "made in-house" | null;
  needsOrdering: boolean;
  reorderQty: number;
  orderUpTo: number;
  reason: string;
};

export type ReorderReport = {
  rows: ReorderRow[];
  summary: { configuredItems: number; needOrdering: number; critical: number; coveredByOpenOrders: number };
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fmt = (n: number) => String(r4(n));
// A purchase order line names a product; stock calls the same thing a finished good.
const stockEntityType = (itemType: unknown) => (String(itemType) === "product" ? "finished_goods" : String(itemType || ""));

export async function buildReorderReport(supabase: SupabaseClient, companyId: string): Promise<ReorderReport> {
  const levels = await listMinimumLevelStatus(supabase, companyId);
  if (!levels.length) return { rows: [], summary: { configuredItems: 0, needOrdering: 0, critical: 0, coveredByOpenOrders: 0 } };

  const items = await readAllIn<{ id: string; entity_type: string | null; entity_id: string | null; supplier_name_snapshot: string | null }>(
    [...new Set(levels.map((l) => l.stock_item_id))],
    (chunk, from, to) =>
      supabase.from("vyron_cost_stock_items").select("id, entity_type, entity_id, supplier_name_snapshot").eq("company_id", companyId).in("id", chunk).order("id", { ascending: true }).range(from, to)
  );
  const entityOf = new Map(items.map((i) => [String(i.id), `${i.entity_type}:${i.entity_id}`]));
  const itemById = new Map(items.map((i) => [String(i.id), i]));

  // Suppliers, all scoped to this company.
  const suppliers = await readAllPages<{ id: string; supplier_name: string | null }>((from, to) =>
    supabase.from("vyron_cost_suppliers").select("id, supplier_name").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
  );
  const supplierName = new Map(suppliers.map((s) => [String(s.id), String(s.supplier_name || "")]));
  const ingredientIds = [...new Set(items.filter((i) => i.entity_type === "ingredient" || i.entity_type === "packaging").map((i) => String(i.entity_id || "")).filter(Boolean))];
  const ingredients = await readAllIn<{ id: string; supplier_id: string | null }>(ingredientIds, (chunk, from, to) =>
    supabase.from("vyron_cost_ingredients").select("id, supplier_id").eq("company_id", companyId).in("id", chunk).order("id", { ascending: true }).range(from, to)
  );
  const ingredientSupplier = new Map(ingredients.filter((i) => i.supplier_id && supplierName.get(String(i.supplier_id))).map((i) => [String(i.id), supplierName.get(String(i.supplier_id))!]));
  // The most recent purchase order (any status) for each item names who it was last bought from.
  const allOrders = await readAllPages<{ id: string; supplier_id: string | null; supplier_name_snapshot: string | null; order_date: string | null; created_at: string | null }>((from, to) =>
    supabase.from("vyron_cost_purchase_orders").select("id, supplier_id, supplier_name_snapshot, order_date, created_at").eq("company_id", companyId).order("id", { ascending: true }).range(from, to)
  );
  const orderById = new Map(allOrders.map((o) => [String(o.id), o]));
  const lastOrderLines = await readAllIn<{ purchase_order_id: string; item_type: string | null; item_id: string | null }>(
    [...orderById.keys()],
    (chunk, from, to) =>
      supabase.from("vyron_cost_purchase_order_lines").select("purchase_order_id, item_type, item_id").eq("company_id", companyId).in("purchase_order_id", chunk).order("id", { ascending: true }).range(from, to)
  );
  const lastBoughtFrom = new Map<string, { name: string; when: string }>();
  for (const l of lastOrderLines) {
    if (!l.item_id) continue;
    const order = orderById.get(String(l.purchase_order_id));
    const name = order ? supplierName.get(String(order.supplier_id || "")) || String(order.supplier_name_snapshot || "") : "";
    if (!name) continue;
    const when = String(order?.order_date || order?.created_at || "");
    const key = `${stockEntityType(l.item_type)}:${l.item_id}`;
    const prev = lastBoughtFrom.get(key);
    if (!prev || when > prev.when) lastBoughtFrom.set(key, { name, when });
  }
  const supplierFor = (stockItemId: string): Pick<ReorderRow, "supplier" | "supplierSource"> => {
    const item = itemById.get(stockItemId);
    if (!item) return { supplier: null, supplierSource: null };
    if (item.entity_type === "finished_goods") return { supplier: "Made in-house (BOM)", supplierSource: "made in-house" };
    const fromMaster = item.entity_id ? ingredientSupplier.get(String(item.entity_id)) : undefined;
    if (fromMaster) return { supplier: fromMaster, supplierSource: "ingredient" };
    const fromPo = lastBoughtFrom.get(`${item.entity_type}:${item.entity_id}`);
    if (fromPo) return { supplier: fromPo.name, supplierSource: "last purchase order" };
    if (item.supplier_name_snapshot) return { supplier: String(item.supplier_name_snapshot), supplierSource: "stock item" };
    return { supplier: null, supplierSource: null };
  };

  const orders = await readAllPages<{ id: string; po_number: string | null; status: string | null }>((from, to) =>
    supabase.from("vyron_cost_purchase_orders").select("id, po_number, status").eq("company_id", companyId).in("status", ON_ORDER_PO_STATUSES).order("id", { ascending: true }).range(from, to)
  );
  const poNumber = new Map(orders.map((o) => [String(o.id), String(o.po_number || o.id)]));
  const lines = await readAllIn<{ purchase_order_id: string; item_type: string | null; item_id: string | null; outstanding_qty: number | null }>(
    [...poNumber.keys()],
    (chunk, from, to) =>
      supabase
        .from("vyron_cost_purchase_order_lines")
        .select("purchase_order_id, item_type, item_id, outstanding_qty")
        .eq("company_id", companyId)
        .in("purchase_order_id", chunk)
        .order("id", { ascending: true })
        .range(from, to)
  );
  const onOrder = new Map<string, { qty: number; pos: Set<string> }>();
  for (const line of lines) {
    const qty = Number(line.outstanding_qty || 0);
    if (!(qty > 0) || !line.item_id) continue;
    const key = `${stockEntityType(line.item_type)}:${line.item_id}`;
    const entry = onOrder.get(key) || { qty: 0, pos: new Set<string>() };
    entry.qty += qty;
    entry.pos.add(poNumber.get(String(line.purchase_order_id)) || "");
    onOrder.set(key, entry);
  }

  const rows: ReorderRow[] = levels.map((level) => {
    const ordered = onOrder.get(entityOf.get(level.stock_item_id) || "") || { qty: 0, pos: new Set<string>() };
    const onHand = r4(Number(level.qty_on_hand || 0));
    const qtyOnOrder = r4(ordered.qty);
    const minimum = Number(level.minimum_qty || 0);
    const warning = level.warning_qty === null || level.warning_qty === undefined ? null : Number(level.warning_qty);
    const critical = level.critical_qty === null || level.critical_qty === undefined ? null : Number(level.critical_qty);
    const available = onHand + qtyOnOrder;
    const orderUpTo = warning !== null && warning > minimum ? warning : minimum;
    const needsOrdering = available < minimum;
    const reorderQty = needsOrdering ? r4(orderUpTo - available) : 0;
    const pos = [...ordered.pos].filter(Boolean).sort();

    const parts: string[] = [];
    if (level.status === "CRITICAL") parts.push(`Critical: on hand ${fmt(onHand)} is at or below the critical level ${fmt(critical ?? 0)}.`);
    else if (onHand < minimum) parts.push(`On hand ${fmt(onHand)} is ${fmt(minimum - onHand)} below the minimum of ${fmt(minimum)}.`);
    if (qtyOnOrder > 0) parts.push(`${fmt(qtyOnOrder)} already on order (${pos.join(", ")}).`);
    if (needsOrdering) {
      parts.push(`Order ${fmt(reorderQty)} to bring stock to ${fmt(orderUpTo)} (${orderUpTo === minimum ? "the minimum" : "the warning level"}).`);
      if (level.block_production) parts.push("Production of items using it is blocked below the minimum.");
    } else if (onHand < minimum) {
      parts.push("Open purchase orders cover the shortfall: nothing more to order.");
    } else if (warning !== null && onHand < warning) {
      parts.push(`Above the minimum but below the warning level of ${fmt(warning)}: not yet needed.`);
    } else {
      parts.push("At or above the minimum.");
    }

    return {
      stockItemId: level.stock_item_id,
      itemCode: level.item_code,
      description: String(level.description || level.item_code || level.stock_item_id),
      unit: level.unit,
      onHand,
      onOrder: qtyOnOrder,
      openPurchaseOrders: pos,
      minimum,
      warning,
      critical,
      status: level.status,
      ...supplierFor(level.stock_item_id),
      needsOrdering,
      reorderQty,
      orderUpTo,
      reason: parts.join(" "),
    };
  });

  const rank = (r: ReorderRow) => (r.needsOrdering ? (r.status === "CRITICAL" ? 0 : 1) : r.onHand < r.minimum ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || b.reorderQty - a.reorderQty || a.description.localeCompare(b.description));

  return {
    rows,
    summary: {
      configuredItems: rows.length,
      needOrdering: rows.filter((r) => r.needsOrdering).length,
      critical: rows.filter((r) => r.status === "CRITICAL").length,
      coveredByOpenOrders: rows.filter((r) => !r.needsOrdering && r.onHand < r.minimum).length,
    },
  };
}
