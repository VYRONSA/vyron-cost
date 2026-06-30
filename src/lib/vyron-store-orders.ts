import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcLineCommercial,
  calcOrderCommercial,
  loadProductUnitCosts,
} from "@/lib/vyron-store-order-commercial";

export const STORE_ORDER_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "Picking",
  "ReadyToDispatch",
  "Dispatched",
  "Delivered",
  "Cancelled",
] as const;

export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];

export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  Draft: "Draft",
  Submitted: "Submitted",
  Approved: "Approved",
  Picking: "Picking",
  ReadyToDispatch: "Ready for Dispatch",
  Dispatched: "Dispatched",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

export const STORE_ORDER_WORKFLOW_ACTIONS = [
  "approve",
  "reject",
  "request_change",
  "start_picking",
  "complete_picking",
  "dispatch",
  "mark_delivered",
] as const;

export type StoreOrderWorkflowAction = (typeof STORE_ORDER_WORKFLOW_ACTIONS)[number];

export const STORE_STATUSES = ["Active", "Inactive"] as const;

const STORE_ORDER_TRANSITIONS: Record<StoreOrderStatus, StoreOrderStatus[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Approved", "Draft", "Cancelled"],
  Approved: ["Picking", "Cancelled"],
  Picking: ["ReadyToDispatch", "Cancelled"],
  ReadyToDispatch: ["Dispatched"],
  Dispatched: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

const WORKFLOW_ACTION_MAP: Record<
  StoreOrderWorkflowAction,
  { to: StoreOrderStatus; from: StoreOrderStatus[] }
> = {
  approve: { to: "Approved", from: ["Submitted"] },
  reject: { to: "Cancelled", from: ["Submitted"] },
  request_change: { to: "Draft", from: ["Submitted"] },
  start_picking: { to: "Picking", from: ["Approved"] },
  complete_picking: { to: "ReadyToDispatch", from: ["Picking"] },
  dispatch: { to: "Dispatched", from: ["ReadyToDispatch"] },
  mark_delivered: { to: "Delivered", from: ["Dispatched"] },
};

export type StoreOrderOperationsStats = {
  ordersToday: number;
  revenueToday: number;
  awaitingApproval: number;
  picking: number;
  readyForDispatch: number;
  delivered: number;
};

export type StoreOrderEventRow = {
  id: string;
  company_id: string;
  store_order_id: string;
  action: string;
  from_status: string;
  to_status: string;
  note: string | null;
  actor: string | null;
  created_at: string;
};

export type StoreRow = {
  id: string;
  company_id: string;
  store_code: string;
  store_name: string;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreOrderLineInput = {
  id?: string;
  product_id: string;
  product_name_snapshot?: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  vat_rate?: number;
};

export type StoreOrderLineRow = StoreOrderLineInput & {
  id: string;
  store_order_id: string;
  company_id: string;
  product_name_snapshot: string;
  unit: string;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  unit_cost: number;
  line_estimated_cost: number;
  line_gross_margin: number;
  line_margin_pct: number;
  sort_order: number;
};

export type StoreOrderRow = {
  id: string;
  company_id: string;
  store_id: string;
  order_number: string;
  status: string;
  order_date: string;
  required_date: string | null;
  notes: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  order_value: number;
  estimated_cost: number;
  gross_margin: number;
  margin_pct: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  picking_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_at: string | null;
  picking_completed_at: string | null;
  ready_to_dispatch_at: string | null;
  rejection_reason: string | null;
  change_request_note: string | null;
  created_at: string;
  updated_at: string;
  store_name_snapshot?: string | null;
  store_code_snapshot?: string | null;
  lines?: StoreOrderLineRow[];
};

export type FinishedGoodOption = {
  id: string;
  product_name: string;
  selling_price: number;
  product_status: string | null;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function isActiveProductStatus(status: string | null | undefined) {
  const normalized = String(status || "Active").trim().toLowerCase();
  return normalized === "active" || normalized === "imported";
}

function calcLineTotals(quantity: number, unitPrice: number, vatRate = 15) {
  const qty = round4(quantity);
  const price = round4(unitPrice);
  const net = round2(qty * price);
  const vatAmount = round2(net * (vatRate / 100));
  const lineTotal = round2(net + vatAmount);
  return { qty, price, net, vatAmount, lineTotal };
}

function calcHeaderTotals(lines: Array<{ line_total: number; vat_amount: number; net: number }>) {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.net, 0));
  const vat_amount = round2(lines.reduce((sum, line) => sum + line.vat_amount, 0));
  const total = round2(lines.reduce((sum, line) => sum + line.line_total, 0));
  return { subtotal, vat_amount, total };
}

function mapStoreOrderLine(row: Record<string, unknown>): StoreOrderLineRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    store_order_id: String(row.store_order_id),
    product_id: String(row.product_id),
    product_name_snapshot: String(row.product_name_snapshot || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "each"),
    unit_price: Number(row.unit_price || 0),
    vat_rate: Number(row.vat_rate ?? 15),
    vat_amount: Number(row.vat_amount || 0),
    line_total: Number(row.line_total || 0),
    unit_cost: Number(row.unit_cost || 0),
    line_estimated_cost: Number(row.line_estimated_cost || 0),
    line_gross_margin: Number(row.line_gross_margin || 0),
    line_margin_pct: Number(row.line_margin_pct || 0),
    sort_order: Number(row.sort_order || 0),
  };
}

export function canTransitionStoreOrder(from: string, to: string): boolean {
  const current = from as StoreOrderStatus;
  const next = to as StoreOrderStatus;
  if (!STORE_ORDER_STATUSES.includes(current) || !STORE_ORDER_STATUSES.includes(next)) return false;
  return STORE_ORDER_TRANSITIONS[current].includes(next);
}

export function nextStoreOrderStatuses(status: string): StoreOrderStatus[] {
  if (!STORE_ORDER_STATUSES.includes(status as StoreOrderStatus)) return [];
  return STORE_ORDER_TRANSITIONS[status as StoreOrderStatus];
}

export function isStoreOrderEditable(status: string) {
  return status === "Draft";
}

export function storeOrderStatusLabel(status: string) {
  if (STORE_ORDER_STATUSES.includes(status as StoreOrderStatus)) {
    return STORE_ORDER_STATUS_LABELS[status as StoreOrderStatus];
  }
  return status;
}

export function workflowActionsForStatus(status: string): StoreOrderWorkflowAction[] {
  return STORE_ORDER_WORKFLOW_ACTIONS.filter((action) =>
    WORKFLOW_ACTION_MAP[action].from.includes(status as StoreOrderStatus)
  );
}

// --- Stores ---

export async function listStores(supabase: SupabaseClient, companyId: string, activeOnly = false) {
  let query = supabase
    .from("vyron_cost_stores")
    .select("*")
    .eq("company_id", companyId)
    .order("store_name", { ascending: true });

  if (activeOnly) query = query.eq("status", "Active");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as StoreRow[];
}

export async function getStoreById(supabase: SupabaseClient, companyId: string, storeId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_stores")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", storeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StoreRow | null) || null;
}

export async function createStore(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    store_code: string;
    store_name: string;
    address?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    status?: string;
    notes?: string | null;
  }
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("vyron_cost_stores")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      store_code: input.store_code.trim(),
      store_name: input.store_name.trim(),
      address: input.address?.trim() || null,
      contact_name: input.contact_name?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      status: input.status || "Active",
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as StoreRow;
}

export async function updateStore(
  supabase: SupabaseClient,
  companyId: string,
  storeId: string,
  input: Partial<{
    store_code: string;
    store_name: string;
    address: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    status: string;
    notes: string | null;
  }>
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.store_code !== undefined) patch.store_code = input.store_code.trim();
  if (input.store_name !== undefined) patch.store_name = input.store_name.trim();
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.contact_name !== undefined) patch.contact_name = input.contact_name?.trim() || null;
  if (input.contact_email !== undefined) patch.contact_email = input.contact_email?.trim() || null;
  if (input.contact_phone !== undefined) patch.contact_phone = input.contact_phone?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("vyron_cost_stores")
    .update(patch)
    .eq("company_id", companyId)
    .eq("id", storeId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as StoreRow;
}

export async function deleteStore(supabase: SupabaseClient, companyId: string, storeId: string) {
  const { count, error: orderError } = await supabase
    .from("vyron_cost_store_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("store_id", storeId);

  if (orderError) throw new Error(orderError.message);
  if ((count || 0) > 0) {
    throw new Error("Cannot delete a store that has store orders.");
  }

  const { error } = await supabase
    .from("vyron_cost_stores")
    .delete()
    .eq("company_id", companyId)
    .eq("id", storeId);

  if (error) throw new Error(error.message);
}

// --- Finished goods for order lines ---

export async function listFinishedGoodsForStoreOrder(
  supabase: SupabaseClient,
  companyId: string
): Promise<FinishedGoodOption[]> {
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, selling_price, product_status, status")
    .eq("company_id", companyId)
    .order("product_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || [])
    .filter((row) => isActiveProductStatus(String(row.product_status || row.status || "Active")))
    .map((row) => ({
      id: String(row.id),
      product_name: String(row.product_name || ""),
      selling_price: Number(row.selling_price || 0),
      product_status: String(row.product_status || row.status || "Active"),
    }));
}

async function resolveProductSnapshots(
  supabase: SupabaseClient,
  companyId: string,
  lines: StoreOrderLineInput[]
) {
  const productIds = [...new Set(lines.map((line) => line.product_id).filter(Boolean))];
  if (!productIds.length) return new Map<string, FinishedGoodOption>();

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, selling_price, product_status, status")
    .eq("company_id", companyId)
    .in("id", productIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, FinishedGoodOption>();
  for (const row of data || []) {
    if (!isActiveProductStatus(String(row.product_status || row.status || "Active"))) continue;
    map.set(String(row.id), {
      id: String(row.id),
      product_name: String(row.product_name || ""),
      selling_price: Number(row.selling_price || 0),
      product_status: String(row.product_status || row.status || "Active"),
    });
  }
  return map;
}

// --- Store orders ---

export async function listStoreOrders(
  supabase: SupabaseClient,
  companyId: string,
  filters?: { status?: string; statuses?: string[]; search?: string; storeId?: string }
) {
  let query = supabase
    .from("vyron_cost_store_orders")
    .select("*, vyron_cost_stores!inner(store_name, store_code)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.statuses?.length) {
    query = query.in("status", filters.statuses);
  } else if (filters?.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }
  if (filters?.storeId) {
    query = query.eq("store_id", filters.storeId);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  let rows = (data || []).map((row) => {
    const store = row.vyron_cost_stores as { store_name?: string; store_code?: string } | null;
    const { vyron_cost_stores: _store, ...order } = row as Record<string, unknown>;
    return {
      ...(order as StoreOrderRow),
      store_name_snapshot: store?.store_name || null,
      store_code_snapshot: store?.store_code || null,
    };
  });

  if (filters?.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    rows = rows.filter((row) =>
      [row.order_number, row.store_name_snapshot, row.store_code_snapshot, row.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }

  return rows;
}

export async function getStoreOrderDetail(
  supabase: SupabaseClient,
  companyId: string,
  orderId: string
): Promise<StoreOrderRow | null> {
  const { data: order, error } = await supabase
    .from("vyron_cost_store_orders")
    .select("*, vyron_cost_stores!inner(store_name, store_code)")
    .eq("company_id", companyId)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_store_order_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("store_order_id", orderId)
    .order("sort_order", { ascending: true });

  if (lineError) throw new Error(lineError.message);

  const store = order.vyron_cost_stores as { store_name?: string; store_code?: string } | null;
  const { vyron_cost_stores: _store, ...header } = order as Record<string, unknown>;

  return {
    ...(header as StoreOrderRow),
    store_name_snapshot: store?.store_name || null,
    store_code_snapshot: store?.store_code || null,
    lines: (lines || []).map((line) => mapStoreOrderLine(line as Record<string, unknown>)),
  };
}

export async function saveStoreOrder(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    id?: string;
    store_id: string;
    order_number?: string;
    order_date?: string;
    required_date?: string | null;
    notes?: string | null;
    lines: StoreOrderLineInput[];
  }
) {
  if (!input.lines.length) {
    throw new Error("At least one order line is required.");
  }

  const store = await getStoreById(supabase, companyId, input.store_id);
  if (!store) throw new Error("Store not found.");
  if (store.status !== "Active") throw new Error("Store is not active.");

  const productMap = await resolveProductSnapshots(supabase, companyId, input.lines);
  const productCosts = await loadProductUnitCosts(supabase, companyId);
  const builtLines = input.lines.map((line, index) => {
    const product = productMap.get(line.product_id);
    if (!product) {
      throw new Error(`Finished good not found or inactive: ${line.product_id}`);
    }
    const unitPrice = line.unit_price !== undefined ? Number(line.unit_price) : product.selling_price;
    const unitCost = productCosts.get(line.product_id)?.unitCost ?? 0;
    const commercial = calcLineCommercial(line.quantity, unitPrice, unitCost, line.vat_rate ?? 15);
    return {
      product_id: line.product_id,
      product_name_snapshot: line.product_name_snapshot?.trim() || product.product_name,
      quantity: commercial.qty,
      unit: line.unit?.trim() || "each",
      unit_price: commercial.price,
      unit_cost: commercial.cost,
      vat_rate: line.vat_rate ?? 15,
      vat_amount: commercial.vatAmount,
      line_total: commercial.lineTotal,
      net: commercial.netRevenue,
      line_estimated_cost: commercial.lineEstimatedCost,
      line_gross_margin: commercial.lineGrossMargin,
      line_margin_pct: commercial.lineMarginPct,
      sort_order: index,
    };
  });

  const headerTotals = calcHeaderTotals(
    builtLines.map((line) => ({
      line_total: line.line_total,
      vat_amount: line.vat_amount,
      net: line.net,
    }))
  );
  const commercialTotals = calcOrderCommercial(
    builtLines.map((line) => ({
      netRevenue: line.net,
      lineEstimatedCost: line.line_estimated_cost,
      lineGrossMargin: line.line_gross_margin,
    }))
  );

  const now = new Date().toISOString();
  const orderDate = input.order_date || new Date().toISOString().slice(0, 10);

  if (input.id) {
    const existing = await getStoreOrderDetail(supabase, companyId, input.id);
    if (!existing) throw new Error("Store order not found.");
    if (!isStoreOrderEditable(existing.status)) {
      throw new Error(`Store order cannot be edited in status ${existing.status}.`);
    }

    const { error: headerError } = await supabase
      .from("vyron_cost_store_orders")
      .update({
        store_id: input.store_id,
        order_date: orderDate,
        required_date: input.required_date || null,
        notes: input.notes?.trim() || null,
        subtotal: headerTotals.subtotal,
        vat_amount: headerTotals.vat_amount,
        total: headerTotals.total,
        order_value: commercialTotals.orderValue,
        estimated_cost: commercialTotals.estimatedCost,
        gross_margin: commercialTotals.grossMargin,
        margin_pct: commercialTotals.marginPct,
        updated_at: now,
      })
      .eq("company_id", companyId)
      .eq("id", input.id);

    if (headerError) throw new Error(headerError.message);

    const { error: deleteError } = await supabase
      .from("vyron_cost_store_order_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("store_order_id", input.id);

    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabase.from("vyron_cost_store_order_lines").insert(
      builtLines.map((line) => ({
        id: randomUUID(),
        company_id: companyId,
        store_order_id: input.id,
        product_id: line.product_id,
        product_name_snapshot: line.product_name_snapshot,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        vat_rate: line.vat_rate,
        vat_amount: line.vat_amount,
        line_total: line.line_total,
        unit_cost: line.unit_cost,
        line_estimated_cost: line.line_estimated_cost,
        line_gross_margin: line.line_gross_margin,
        line_margin_pct: line.line_margin_pct,
        sort_order: line.sort_order,
        created_at: now,
        updated_at: now,
      }))
    );

    if (insertError) throw new Error(insertError.message);

    const detail = await getStoreOrderDetail(supabase, companyId, input.id);
    if (!detail) throw new Error("Store order not found after save.");
    return detail;
  }

  const orderNumber = input.order_number?.trim() || `SO-${Date.now().toString().slice(-8)}`;
  const orderId = randomUUID();

  const { error: headerError } = await supabase.from("vyron_cost_store_orders").insert({
    id: orderId,
    company_id: companyId,
    store_id: input.store_id,
    order_number: orderNumber,
    status: "Draft",
    order_date: orderDate,
    required_date: input.required_date || null,
    notes: input.notes?.trim() || null,
    subtotal: headerTotals.subtotal,
    vat_amount: headerTotals.vat_amount,
    total: headerTotals.total,
    order_value: commercialTotals.orderValue,
    estimated_cost: commercialTotals.estimatedCost,
    gross_margin: commercialTotals.grossMargin,
    margin_pct: commercialTotals.marginPct,
    created_at: now,
    updated_at: now,
  });

  if (headerError) throw new Error(headerError.message);

  const { error: insertError } = await supabase.from("vyron_cost_store_order_lines").insert(
    builtLines.map((line) => ({
      id: randomUUID(),
      company_id: companyId,
      store_order_id: orderId,
      product_id: line.product_id,
      product_name_snapshot: line.product_name_snapshot,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      vat_rate: line.vat_rate,
      vat_amount: line.vat_amount,
      line_total: line.line_total,
      unit_cost: line.unit_cost,
      line_estimated_cost: line.line_estimated_cost,
      line_gross_margin: line.line_gross_margin,
      line_margin_pct: line.line_margin_pct,
      sort_order: line.sort_order,
      created_at: now,
      updated_at: now,
    }))
  );

  if (insertError) throw new Error(insertError.message);

  const detail = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!detail) throw new Error("Store order not found after create.");
  return detail;
}

export async function deleteStoreOrder(supabase: SupabaseClient, companyId: string, orderId: string) {
  const existing = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!existing) throw new Error("Store order not found.");
  if (!isStoreOrderEditable(existing.status)) {
    throw new Error(`Only draft store orders can be deleted.`);
  }

  const { error } = await supabase
    .from("vyron_cost_store_orders")
    .delete()
    .eq("company_id", companyId)
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

export async function transitionStoreOrder(
  supabase: SupabaseClient,
  companyId: string,
  orderId: string,
  nextStatus: string,
  opts?: { approvedBy?: string }
) {
  const existing = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!existing) throw new Error("Store order not found.");

  if (!canTransitionStoreOrder(existing.status, nextStatus)) {
    throw new Error(`Cannot move store order from ${existing.status} to ${nextStatus}.`);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
  };

  if (nextStatus === "Submitted") patch.submitted_at = now;
  if (nextStatus === "Approved") {
    patch.approved_at = now;
    patch.approved_by = opts?.approvedBy || "supervisor";
  }
  if (nextStatus === "Picking") patch.picking_at = now;
  if (nextStatus === "ReadyToDispatch") {
    patch.picking_completed_at = now;
    patch.ready_to_dispatch_at = now;
  }
  if (nextStatus === "Dispatched") patch.dispatched_at = now;
  if (nextStatus === "Delivered") patch.delivered_at = now;
  if (nextStatus === "Cancelled") patch.cancelled_at = now;

  const { error } = await supabase
    .from("vyron_cost_store_orders")
    .update(patch)
    .eq("company_id", companyId)
    .eq("id", orderId);

  if (error) throw new Error(error.message);

  const detail = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!detail) throw new Error("Store order not found after transition.");
  return detail;
}

async function insertStoreOrderEvent(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    store_order_id: string;
    action: string;
    from_status: string;
    to_status: string;
    note?: string | null;
    actor?: string | null;
  }
) {
  const { error } = await supabase.from("vyron_cost_store_order_events").insert({
    id: randomUUID(),
    company_id: companyId,
    store_order_id: input.store_order_id,
    action: input.action,
    from_status: input.from_status,
    to_status: input.to_status,
    note: input.note?.trim() || null,
    actor: input.actor?.trim() || null,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function applyStoreOrderWorkflowAction(
  supabase: SupabaseClient,
  companyId: string,
  orderId: string,
  action: string,
  opts?: { note?: string; actor?: string }
) {
  if (!STORE_ORDER_WORKFLOW_ACTIONS.includes(action as StoreOrderWorkflowAction)) {
    throw new Error("Invalid workflow action.");
  }

  const workflow = WORKFLOW_ACTION_MAP[action as StoreOrderWorkflowAction];
  const existing = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!existing) throw new Error("Store order not found.");

  if (!workflow.from.includes(existing.status as StoreOrderStatus)) {
    throw new Error(`Cannot ${action.replace(/_/g, " ")} from status ${existing.status}.`);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: workflow.to,
    updated_at: now,
  };

  if (workflow.to === "Approved") {
    patch.approved_at = now;
    patch.approved_by = opts?.actor || "supervisor";
  }
  if (workflow.to === "Draft" && action === "request_change") {
    patch.change_request_note = opts?.note?.trim() || null;
    patch.submitted_at = null;
  }
  if (workflow.to === "Cancelled" && action === "reject") {
    patch.rejection_reason = opts?.note?.trim() || null;
    patch.rejected_at = now;
    patch.cancelled_at = now;
  }
  if (workflow.to === "Picking") patch.picking_at = now;
  if (workflow.to === "ReadyToDispatch") {
    patch.picking_completed_at = now;
    patch.ready_to_dispatch_at = now;
  }
  if (workflow.to === "Dispatched") patch.dispatched_at = now;
  if (workflow.to === "Delivered") patch.delivered_at = now;

  const { error } = await supabase
    .from("vyron_cost_store_orders")
    .update(patch)
    .eq("company_id", companyId)
    .eq("id", orderId);

  if (error) throw new Error(error.message);

  await insertStoreOrderEvent(supabase, companyId, {
    store_order_id: orderId,
    action,
    from_status: existing.status,
    to_status: workflow.to,
    note: opts?.note,
    actor: opts?.actor,
  });

  if (workflow.to === "Dispatched") {
    const detailForDispatch = await getStoreOrderDetail(supabase, companyId, orderId);
    if (detailForDispatch) {
      const { postStoreOrderDispatchInventory } = await import("@/lib/vyron-inventory-transactions");
      await postStoreOrderDispatchInventory(supabase, companyId, detailForDispatch, opts?.actor);
    }
  }

  const detail = await getStoreOrderDetail(supabase, companyId, orderId);
  if (!detail) throw new Error("Store order not found after workflow action.");
  return detail;
}

export async function getStoreOrderOperationsStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<StoreOrderOperationsStats> {
  const { getStoreOrderCommercialDashboard } = await import("@/lib/vyron-store-order-commercial");
  const dashboard = await getStoreOrderCommercialDashboard(supabase, companyId);
  return {
    ordersToday: dashboard.ordersToday,
    revenueToday: dashboard.revenueToday,
    awaitingApproval: dashboard.pendingApproval,
    picking: dashboard.picking,
    readyForDispatch: dashboard.readyForDispatch,
    delivered: dashboard.delivered,
  };
}
