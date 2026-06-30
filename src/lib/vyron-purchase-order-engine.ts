import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postInventoryTransaction } from "@/lib/vyron-inventory-transactions";
import {
  calcPoLineOutstanding,
  getPurchaseOrderDetail,
  savePurchaseOrder,
  type PurchaseOrderRow,
} from "@/lib/vyron-procurement";
import {
  getProcurementRequisitionDetail,
  recommendSupplierForIngredient,
  updateProcurementRequisitionStatus,
  type ProcurementRequisitionRow,
} from "@/lib/vyron-procurement-requisitions";

export const PO_ENGINE_STATUSES = ["Draft", "Sent", "Partially Received", "Received", "Cancelled"] as const;

export type PoEngineStatus = (typeof PO_ENGINE_STATUSES)[number];

export const PO_ENGINE_STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  Sent: "Sent",
  Submitted: "Sent",
  Approved: "Sent",
  "Partially Received": "Partially Received",
  "Fully Received": "Received",
  Received: "Received",
  Closed: "Received",
  Cancelled: "Cancelled",
};

export type PurchaseOrderEngineRow = {
  id: string;
  company_id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string;
  status: string;
  display_status: string;
  order_date: string | null;
  expected_date: string | null;
  total_value: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  procurement_requisition_id: string | null;
  line_count?: number;
  lines?: PurchaseOrderEngineLineRow[];
};

export type PurchaseOrderEngineLineRow = {
  id: string;
  purchase_order_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  received_qty: number;
  outstanding_qty: number;
  unit: string;
};

export type SupplierPerformanceSnapshot = {
  supplier_id: string;
  supplier_name: string;
  lead_time_days: number;
  on_time_delivery_pct: number;
  order_count: number;
  purchase_value: number;
  warning: string | null;
};

export type PurchaseOrderEngineDashboardStats = {
  openPurchaseOrders: number;
  outstandingReceipts: number;
  purchaseValueThisMonth: number;
  lateDeliveries: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function mapPoDisplayStatus(status: string): string {
  return PO_ENGINE_STATUS_LABELS[status] || status;
}

export async function nextPurchaseOrderNumber(supabase: SupabaseClient, companyId: string) {
  const { count } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  const seq = String((count || 0) + 1).padStart(4, "0");
  return `PO-${seq}`;
}

function mapPoHeader(row: Record<string, unknown>, lineCount = 0): PurchaseOrderEngineRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    po_number: String(row.po_number),
    supplier_id: row.supplier_id ? String(row.supplier_id) : null,
    supplier_name: String(row.supplier_name_snapshot || "—"),
    status: String(row.status),
    display_status: mapPoDisplayStatus(String(row.status)),
    order_date: row.order_date ? String(row.order_date) : null,
    expected_date: row.expected_date ? String(row.expected_date) : null,
    total_value: Number(row.total || row.expected_total || 0),
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at || row.created_at),
    procurement_requisition_id: row.procurement_requisition_id
      ? String(row.procurement_requisition_id)
      : null,
    line_count: lineCount,
  };
}

function mapPoLine(row: Record<string, unknown>): PurchaseOrderEngineLineRow {
  const quantity = Number(row.ordered_qty ?? row.quantity ?? 0);
  const received = Number(row.received_qty || 0);
  return {
    id: String(row.id),
    purchase_order_id: String(row.purchase_order_id),
    ingredient_id: row.item_id ? String(row.item_id) : null,
    ingredient_name: String(row.item_name || ""),
    quantity: round4(quantity),
    unit_cost: round4(Number(row.unit_price || 0)),
    line_total: round2(Number(row.line_total || 0)),
    received_qty: round4(received),
    outstanding_qty: round4(
      Number(row.outstanding_qty ?? calcPoLineOutstanding({ ordered_qty: quantity, received_qty: received }))
    ),
    unit: String(row.unit || "kg"),
  };
}

export async function listPurchaseOrdersEngine(
  supabase: SupabaseClient,
  companyId: string,
  filters?: { status?: string; search?: string }
) {
  let query = supabase
    .from("vyron_cost_purchase_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "All") {
    if (filters.status === "Received") {
      query = query.in("status", ["Fully Received", "Received", "Closed"]);
    } else if (filters.status === "Sent") {
      query = query.in("status", ["Sent", "Approved", "Submitted"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  let rows = (data || []) as Record<string, unknown>[];
  const term = filters?.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((row) =>
      [row.po_number, row.supplier_name_snapshot, row.status].join(" ").toLowerCase().includes(term)
    );
  }

  if (!rows.length) return [];

  const poIds = rows.map((row) => String(row.id));
  const { data: lineCounts } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("purchase_order_id")
    .eq("company_id", companyId)
    .in("purchase_order_id", poIds);

  const countByPo = new Map<string, number>();
  for (const line of lineCounts || []) {
    const id = String(line.purchase_order_id);
    countByPo.set(id, (countByPo.get(id) || 0) + 1);
  }

  return rows.map((row) => mapPoHeader(row, countByPo.get(String(row.id)) || 0));
}

export async function getPurchaseOrderEngineDetail(
  supabase: SupabaseClient,
  companyId: string,
  poId: string
): Promise<PurchaseOrderEngineRow | null> {
  const { data: po, error } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", poId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("purchase_order_id", poId)
    .order("sort_order", { ascending: true });
  if (lineError) throw new Error(lineError.message);

  const mappedLines = (lines || []).map((line) => mapPoLine(line as Record<string, unknown>));
  return {
    ...mapPoHeader(po as Record<string, unknown>, mappedLines.length),
    lines: mappedLines,
  };
}

export async function generatePurchaseOrdersFromRequisition(
  supabase: SupabaseClient,
  companyId: string,
  requisitionId: string,
  actor?: string
): Promise<{ requisition: ProcurementRequisitionRow; purchase_orders: PurchaseOrderEngineRow[] }> {
  const requisition = await getProcurementRequisitionDetail(supabase, companyId, requisitionId);
  if (!requisition) throw new Error("Requisition not found.");

  if (!["Approved", "ReadyForPurchase"].includes(requisition.status)) {
    throw new Error(`Cannot generate purchase orders from requisition in status ${requisition.status}.`);
  }

  const lines = requisition.lines || [];
  if (!lines.length) throw new Error("Requisition has no lines.");

  const grouped = new Map<
    string,
    {
      supplier_id: string;
      supplier_name: string;
      lines: typeof lines;
    }
  >();

  for (const line of lines) {
    let supplierId = line.preferred_supplier_id;
    let supplierName = "Preferred Supplier";

    if (!supplierId) {
      const rec = await recommendSupplierForIngredient(supabase, companyId, line.ingredient_id ?? null);
      supplierId = rec?.supplier_id || null;
      supplierName = rec?.supplier_name || "Unassigned Supplier";
    } else {
      const { data: supplier } = await supabase
        .from("vyron_cost_suppliers")
        .select("supplier_name")
        .eq("id", supplierId)
        .eq("company_id", companyId)
        .maybeSingle();
      supplierName = String(supplier?.supplier_name || supplierName);
    }

    if (!supplierId) {
      throw new Error(`No supplier available for ${line.ingredient_name}. Assign a preferred supplier first.`);
    }

    const bucket = grouped.get(supplierId) || {
      supplier_id: supplierId,
      supplier_name: supplierName,
      lines: [],
    };
    bucket.lines.push(line);
    grouped.set(supplierId, bucket);
  }

  const created: PurchaseOrderEngineRow[] = [];
  const orderDate = new Date().toISOString().slice(0, 10);

  for (const group of grouped.values()) {
    const poNumber = await nextPurchaseOrderNumber(supabase, companyId);
    const poLines = group.lines.map((line) => {
      const qty = round4(line.shortage_qty);
      const unitCost = qty > 0 ? round4(line.estimated_cost / qty) : 0;
      return {
        item_type: "ingredient" as const,
        item_id: line.ingredient_id,
        item_name: line.ingredient_name,
        quantity: qty,
        unit: line.unit || "kg",
        unit_price: unitCost,
        vat_rate: 0,
        expected_delivery_date: requisition.required_date,
      };
    });

    const saved = await savePurchaseOrder(
      supabase,
      companyId,
      {
        po_number: poNumber,
        supplier_id: group.supplier_id,
        supplier_name_snapshot: group.supplier_name,
        status: "Draft",
        order_date: orderDate,
        notes: `Generated from ${requisition.requisition_number}`,
        lines: poLines,
      },
      actor || "system"
    );
    if (!saved?.id) throw new Error("Failed to create purchase order.");

    await supabase
      .from("vyron_cost_purchase_orders")
      .update({
        expected_date: requisition.required_date,
        procurement_requisition_id: requisitionId,
        created_by: actor || "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .eq("company_id", companyId);

    const detail = await getPurchaseOrderEngineDetail(supabase, companyId, saved.id);
    if (detail) created.push(detail);
  }

  const updatedReq = await updateProcurementRequisitionStatus(supabase, companyId, requisitionId, "Ordered");

  return { requisition: updatedReq, purchase_orders: created };
}

async function refreshPoReceiptStatus(supabase: SupabaseClient, companyId: string, poId: string) {
  const { data: lines } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("ordered_qty, quantity, received_qty")
    .eq("company_id", companyId)
    .eq("purchase_order_id", poId);

  const rows = lines || [];
  const allReceived = rows.every(
    (line) => Number(line.received_qty || 0) >= Number(line.ordered_qty ?? line.quantity ?? 0) - 0.0001
  );
  const anyReceived = rows.some((line) => Number(line.received_qty || 0) > 0);
  const newStatus = allReceived ? "Fully Received" : anyReceived ? "Partially Received" : "Sent";

  await supabase
    .from("vyron_cost_purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("company_id", companyId);
}

export async function receivePurchaseOrderStock(
  supabase: SupabaseClient,
  companyId: string,
  poId: string,
  input: {
    mode: "full" | "partial";
    lines?: Array<{ line_id: string; receive_qty: number }>;
    actor?: string;
  }
) {
  const po = await getPurchaseOrderDetail(supabase, poId, companyId);
  if (!po) throw new Error("Purchase order not found.");

  const blocked = ["Draft", "Cancelled", "Closed"];
  if (blocked.includes(String(po.status))) {
    throw new Error(`Cannot receive goods for purchase order in status ${po.status}.`);
  }

  const actor = input.actor || "system";
  const receivePlan: Array<{ line: NonNullable<PurchaseOrderRow["lines"]>[number]; qty: number }> = [];

  for (const line of po.lines || []) {
    const outstanding = calcPoLineOutstanding(line);
    if (outstanding <= 0) continue;

    if (input.mode === "full") {
      receivePlan.push({ line, qty: outstanding });
      continue;
    }

    const override = input.lines?.find((row) => row.line_id === line.id);
    const qty = round4(override?.receive_qty ?? 0);
    if (qty > 0) receivePlan.push({ line, qty: Math.min(qty, outstanding) });
  }

  if (!receivePlan.length) throw new Error("No quantities to receive.");

  for (const { line, qty } of receivePlan) {
    const newReceived = round4(Number(line.received_qty || 0) + qty);
    const outstanding = calcPoLineOutstanding({
      ordered_qty: line.ordered_qty ?? line.quantity,
      received_qty: newReceived,
      damaged_qty: line.damaged_qty,
      rejected_qty: line.rejected_qty,
    });

    await supabase
      .from("vyron_cost_purchase_order_lines")
      .update({
        received_qty: newReceived,
        outstanding_qty: outstanding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (line.item_type === "ingredient" && line.item_id && qty > 0) {
      await postInventoryTransaction(supabase, {
        companyId,
        transactionType: "Receipt",
        entityType: "ingredient",
        entityId: line.item_id,
        quantity: qty,
        unitCost: round4(Number(line.unit_price || 0)),
        referenceType: "purchase_order_receive",
        referenceId: poId,
        referenceLabel: po.po_number,
        notes: `PO receipt ${po.po_number}: ${line.item_name}`,
        createdBy: actor,
      });
    }
  }

  await refreshPoReceiptStatus(supabase, companyId, poId);
  const detail = await getPurchaseOrderEngineDetail(supabase, companyId, poId);
  if (!detail) throw new Error("Purchase order not found after receipt.");
  return detail;
}

export async function getSupplierPerformanceForPo(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string
): Promise<SupplierPerformanceSnapshot | null> {
  const { data: supplier } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, supplier_name, lead_time_days, last_price_movement, risk_status")
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplier) return null;

  const { data: orders } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, total, expected_date, order_date, status, created_at")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);

  const rows = orders || [];
  const purchaseValue = round2(rows.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const orderCount = rows.length;

  const receivedOrders = rows.filter((row) =>
    ["Fully Received", "Partially Received", "Received", "Closed"].includes(String(row.status))
  );

  let onTime = 0;
  for (const order of receivedOrders) {
    const expected = order.expected_date || order.order_date;
    if (!expected) {
      onTime += 1;
      continue;
    }
    const expectedMs = new Date(String(expected)).getTime();
    const actualMs = new Date(String(order.created_at)).getTime();
    if (actualMs <= expectedMs + 86400000) onTime += 1;
  }

  const onTimePct = receivedOrders.length ? round2((onTime / receivedOrders.length) * 100) : 100;
  const leadTime = Number(supplier.lead_time_days || 0);
  const movement = Math.abs(Number(supplier.last_price_movement || 0));

  let warning: string | null = null;
  if (onTimePct < 70) warning = "Below-target on-time delivery — monitor supplier performance.";
  else if (leadTime > 14) warning = `Average lead time is ${leadTime} days.`;
  else if (movement > 8) warning = "Recent supplier price movement detected.";

  return {
    supplier_id: String(supplier.id),
    supplier_name: String(supplier.supplier_name),
    lead_time_days: leadTime,
    on_time_delivery_pct: onTimePct,
    order_count: orderCount,
    purchase_value: purchaseValue,
    warning,
  };
}

export async function getPurchaseOrderEngineDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<PurchaseOrderEngineDashboardStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const [{ data: openPos }, { data: monthPos }, { data: poLines }] = await Promise.all([
    supabase
      .from("vyron_cost_purchase_orders")
      .select("id, expected_date, status")
      .eq("company_id", companyId)
      .in("status", ["Draft", "Sent", "Approved", "Submitted", "Partially Received"]),
    supabase
      .from("vyron_cost_purchase_orders")
      .select("total")
      .eq("company_id", companyId)
      .gte("created_at", monthIso),
    supabase
      .from("vyron_cost_purchase_order_lines")
      .select("outstanding_qty, ordered_qty, quantity, received_qty")
      .eq("company_id", companyId),
  ]);

  const outstandingReceipts = (poLines || []).filter((line) => {
    const outstanding = Number(
      line.outstanding_qty ??
        calcPoLineOutstanding({
          ordered_qty: line.ordered_qty ?? line.quantity,
          received_qty: line.received_qty,
        })
    );
    return outstanding > 0.0001;
  }).length;

  const purchaseValueThisMonth = round2(
    (monthPos || []).reduce((sum, row) => sum + Number(row.total || 0), 0)
  );

  const today = new Date().toISOString().slice(0, 10);
  const lateDeliveries = (openPos || []).filter((row) => {
    const expected = row.expected_date ? String(row.expected_date) : null;
    return expected && expected < today && String(row.status) !== "Fully Received";
  }).length;

  return {
    openPurchaseOrders: openPos?.length || 0,
    outstandingReceipts,
    purchaseValueThisMonth,
    lateDeliveries,
  };
}
