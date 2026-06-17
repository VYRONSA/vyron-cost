import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { receiveStockFromGrn, reverseStockFromGrn, rollbackGrnStockPostings, hasGrnPostedStock } from "@/lib/vyron-inventory";
import { computeThreeWayMatch, upsertThreeWayMatch } from "@/lib/vyron-three-way-match";

export const PO_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "Sent",
  "Partially Received",
  "Fully Received",
  "Closed",
  "Cancelled",
] as const;

export type PoItemType = "ingredient" | "packaging" | "product" | "non_stock";

export type PurchaseOrderLineInput = {
  id?: string;
  item_type: PoItemType;
  item_id?: string | null;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate?: number;
  expected_delivery_date?: string | null;
};

export type PurchaseOrderLineRow = PurchaseOrderLineInput & {
  id: string;
  purchase_order_id: string;
  vat_amount: number;
  line_total: number;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  rejected_qty: number;
  outstanding_qty: number;
};

export type PurchaseOrderRow = {
  id: string;
  company_id: string;
  supplier_id: string | null;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  order_date: string | null;
  notes: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  expected_total: number;
  invoice_total: number;
  variance: number;
  outstanding_amount: number;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  match_status: string | null;
  created_at: string;
  lines?: PurchaseOrderLineRow[];
};

export type PoApprovalRules = {
  autoApproveBelow: number;
  supervisorApproveBelow: number;
  requirePoBeforeInvoiceApproval: boolean;
};

export const DEFAULT_PO_APPROVAL_RULES: PoApprovalRules = {
  autoApproveBelow: 5000,
  supervisorApproveBelow: 25000,
  requirePoBeforeInvoiceApproval: true,
};

function mapPoApprovalRulesRow(row: Record<string, unknown>): PoApprovalRules {
  return {
    autoApproveBelow: Number(row.auto_approve_below ?? DEFAULT_PO_APPROVAL_RULES.autoApproveBelow),
    supervisorApproveBelow: Number(row.supervisor_approve_below ?? DEFAULT_PO_APPROVAL_RULES.supervisorApproveBelow),
    requirePoBeforeInvoiceApproval:
      row.require_po_before_invoice_approval === null || row.require_po_before_invoice_approval === undefined
        ? DEFAULT_PO_APPROVAL_RULES.requirePoBeforeInvoiceApproval
        : Boolean(row.require_po_before_invoice_approval),
  };
}

export type GrnLineInput = {
  purchase_order_line_id?: string | null;
  item_name: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty?: number;
  rejected_qty?: number;
  unit: string;
};

export const GRN_ALLOWED_PO_STATUSES = ["Approved", "Sent", "Partially Received"] as const;

/** Outstanding = ordered − cumulative received − cumulative damaged − cumulative rejected (never below zero). */
export function calcPoLineOutstanding(poLine: {
  ordered_qty?: number;
  quantity?: number;
  received_qty?: number;
  damaged_qty?: number;
  rejected_qty?: number;
}): number {
  const ordered = Number(poLine.ordered_qty ?? poLine.quantity ?? 0);
  const received = Number(poLine.received_qty || 0);
  const damaged = Number(poLine.damaged_qty || 0);
  const rejected = Number(poLine.rejected_qty || 0);
  return Math.max(0, Math.round((ordered - received - damaged - rejected) * 10000) / 10000);
}

export function validateGoodsReceiptInput(
  po: PurchaseOrderRow,
  input: { lines: GrnLineInput[] }
): void {
  const status = String(po.status || "");
  if (status === "Draft") {
    throw new Error("Cannot receive goods against a Draft purchase order. Submit and approve the PO first.");
  }
  if (status === "Submitted") {
    throw new Error("Cannot receive goods against a Submitted purchase order. Approve the PO before receiving.");
  }
  if (status === "Closed") {
    throw new Error("Cannot receive goods against a Closed purchase order.");
  }
  if (status === "Fully Received") {
    throw new Error("Cannot receive goods against a Fully Received purchase order.");
  }
  if (status === "Cancelled") {
    throw new Error("Cannot receive goods against a Cancelled purchase order.");
  }
  if (!GRN_ALLOWED_PO_STATUSES.includes(status as (typeof GRN_ALLOWED_PO_STATUSES)[number])) {
    throw new Error(`Cannot receive goods against purchase order in status "${status}".`);
  }

  if (!input.lines?.length) {
    throw new Error("At least one GRN line is required.");
  }

  let totalMovementQty = 0;
  for (const line of input.lines) {
    const received = Number(line.received_qty || 0);
    const damaged = Number(line.damaged_qty || 0);
    const rejected = Number(line.rejected_qty || 0);

    if (received < 0 || damaged < 0 || rejected < 0) {
      throw new Error(`Negative quantities are not allowed for ${line.item_name}.`);
    }

    const lineTotal = received + damaged + rejected;
    totalMovementQty += lineTotal;

    if (!line.purchase_order_line_id) {
      if (lineTotal > 0) {
        throw new Error(`GRN line ${line.item_name} must be linked to a purchase order line.`);
      }
      continue;
    }

    const poLine = po.lines?.find((l) => l.id === line.purchase_order_line_id);
    if (!poLine) {
      throw new Error(`Purchase order line not found for ${line.item_name}.`);
    }

    const outstandingBefore = calcPoLineOutstanding(poLine);
    if (lineTotal > outstandingBefore + 0.001) {
      throw new Error(
        `Cannot receive ${lineTotal} for ${line.item_name}: only ${outstandingBefore} outstanding on the purchase order.`
      );
    }
  }

  if (totalMovementQty <= 0.001) {
    throw new Error("GRN must include a positive received, damaged, or rejected quantity.");
  }
}

export function calcLineTotals(quantity: number, unitPrice: number, vatRate = 15) {
  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const lineTotal = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatAmount, lineTotal };
}

export function calcPoHeaderTotals(lines: Array<{ line_total: number; vat_amount?: number; subtotal?: number }>) {
  const subtotal = lines.reduce((s, l) => s + Number(l.subtotal ?? l.line_total - (l.vat_amount || 0)), 0);
  const vatAmount = lines.reduce((s, l) => s + Number(l.vat_amount || 0), 0);
  const total = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat_amount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export async function writeProcurementAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    entityLabel?: string;
    detail: string;
    actor?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("vyron_procurement_audit_log").insert({
    company_id: params.companyId,
    event_type: params.eventType,
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    entity_label: params.entityLabel || null,
    detail: params.detail,
    actor: params.actor || "system",
    metadata: params.metadata || {},
  });
}

export async function getPoApprovalRules(
  supabase: SupabaseClient,
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<PoApprovalRules> {
  const { data, error } = await supabase
    .from("vyron_po_approval_rules")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...DEFAULT_PO_APPROVAL_RULES };
  return mapPoApprovalRulesRow(data as Record<string, unknown>);
}

export async function savePoApprovalRules(
  supabase: SupabaseClient,
  companyId: string,
  rules: PoApprovalRules
): Promise<PoApprovalRules> {
  const payload = {
    auto_approve_below: rules.autoApproveBelow,
    supervisor_approve_below: rules.supervisorApproveBelow,
    require_po_before_invoice_approval: rules.requirePoBeforeInvoiceApproval,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: loadError } = await supabase
    .from("vyron_po_approval_rules")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);

  if (existing?.id) {
    const { error } = await supabase.from("vyron_po_approval_rules").update(payload).eq("company_id", companyId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("vyron_po_approval_rules").insert({ company_id: companyId, ...payload });
    if (error) throw new Error(error.message);
  }

  const { data: saved, error: readError } = await supabase
    .from("vyron_po_approval_rules")
    .select("*")
    .eq("company_id", companyId)
    .single();
  if (readError) throw new Error(readError.message);
  return mapPoApprovalRulesRow(saved as Record<string, unknown>);
}

export function approvalTierForTotal(total: number, rules: PoApprovalRules): "auto" | "supervisor" | "manager" {
  if (total < rules.autoApproveBelow) return "auto";
  if (total < rules.supervisorApproveBelow) return "supervisor";
  return "manager";
}

export async function getProcurementDashboardStats(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data: pos } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, status, total, expected_total, variance")
    .eq("company_id", companyId);

  const rows = pos || [];
  const open = rows.filter((r) => ["Draft", "Submitted", "Approved", "Sent", "Partially Received"].includes(String(r.status))).length;
  const pendingApproval = rows.filter((r) => r.status === "Submitted").length;
  const partial = rows.filter((r) => r.status === "Partially Received").length;
  const closed = rows.filter((r) => ["Closed", "Fully Received"].includes(String(r.status))).length;
  const variances = rows.filter((r) => Math.abs(Number(r.variance || 0)) > 0.01).length;

  const { count: backOrderCount } = await supabase
    .from("vyron_cost_back_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "Open");

  return {
    openPos: open,
    pendingApproval,
    partiallyReceived: partial,
    closedPos: closed,
    backOrders: backOrderCount || 0,
    poVariances: variances,
  };
}

function mapPoLine(row: Record<string, unknown>): PurchaseOrderLineRow {
  return {
    id: String(row.id),
    purchase_order_id: String(row.purchase_order_id),
    item_type: String(row.item_type) as PoItemType,
    item_id: row.item_id ? String(row.item_id) : null,
    item_name: String(row.item_name),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "kg"),
    unit_price: Number(row.unit_price || 0),
    vat_rate: Number(row.vat_rate || 15),
    vat_amount: Number(row.vat_amount || 0),
    line_total: Number(row.line_total || 0),
    expected_delivery_date: (row.expected_delivery_date as string) || null,
    ordered_qty: Number(row.ordered_qty ?? row.quantity ?? 0),
    received_qty: Number(row.received_qty || 0),
    damaged_qty: Number(row.damaged_qty || 0),
    rejected_qty: Number(row.rejected_qty || 0),
    outstanding_qty: Number(row.outstanding_qty || 0),
  };
}

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  companyId = VYRON_DEFAULT_TENANT_ID,
  filters?: { status?: string; search?: string }
) {
  let query = supabase
    .from("vyron_cost_purchase_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  let rows = (data || []) as Record<string, unknown>[];
  if (filters?.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    rows = rows.filter((r) =>
      [r.po_number, r.supplier_name_snapshot, r.status].join(" ").toLowerCase().includes(term)
    );
  }
  return rows.map((r) => ({ ...r, id: String(r.id) })) as PurchaseOrderRow[];
}

export async function getPurchaseOrderDetail(
  supabase: SupabaseClient,
  poId: string,
  companyId?: string
) {
  let poQuery = supabase.from("vyron_cost_purchase_orders").select("*").eq("id", poId);
  if (companyId) poQuery = poQuery.eq("company_id", companyId);
  const { data: po, error } = await poQuery.maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) return null;

  let linesQuery = supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", poId)
    .order("sort_order", { ascending: true });
  if (companyId) linesQuery = linesQuery.eq("company_id", companyId);
  const { data: lines } = await linesQuery;

  return {
    ...(po as PurchaseOrderRow),
    lines: (lines || []).map((l) => mapPoLine(l as Record<string, unknown>)),
  };
}

export async function savePurchaseOrder(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    id?: string;
    po_number: string;
    supplier_id?: string | null;
    supplier_name_snapshot: string;
    status?: string;
    order_date?: string;
    notes?: string;
    lines: PurchaseOrderLineInput[];
  },
  actor = "user"
) {
  const builtLines = input.lines.map((line, index) => {
    const { vatAmount, lineTotal } = calcLineTotals(line.quantity, line.unit_price, line.vat_rate ?? 15);
    return {
      ...line,
      vat_amount: vatAmount,
      line_total: lineTotal,
      ordered_qty: line.quantity,
      outstanding_qty: line.quantity,
      sort_order: index,
    };
  });
  const headerTotals = calcPoHeaderTotals(
    builtLines.map((l) => ({ line_total: l.line_total, vat_amount: l.vat_amount, subtotal: l.line_total - l.vat_amount }))
  );

  const approvalRules = await getPoApprovalRules(supabase, companyId);
  const approvalTier = approvalTierForTotal(headerTotals.total, approvalRules);
  let orderStatus = input.status || "Draft";
  let approvalNotes: string | null = null;
  let approvedAt: string | null = null;
  let approvedBy: string | null = null;
  if (orderStatus === "Submitted" && approvalTier === "auto") {
    orderStatus = "Approved";
    approvalNotes = "Auto-approved below threshold.";
    approvedAt = new Date().toISOString();
    approvedBy = actor;
  }

  let headerPayload: Record<string, unknown> = {
    company_id: companyId,
    supplier_id: input.supplier_id || null,
    po_number: input.po_number,
    supplier_name_snapshot: input.supplier_name_snapshot,
    status: orderStatus,
    order_date: input.order_date || new Date().toISOString().slice(0, 10),
    notes: input.notes || null,
    subtotal: headerTotals.subtotal,
    vat_amount: headerTotals.vat_amount,
    total: headerTotals.total,
    expected_total: headerTotals.total,
    outstanding_amount: headerTotals.total,
    updated_at: new Date().toISOString(),
  };
  if (orderStatus === "Submitted") {
    headerPayload.submitted_at = new Date().toISOString();
  }
  if (orderStatus === "Approved" && approvedAt) {
    headerPayload.approved_at = approvedAt;
    headerPayload.approved_by = approvedBy;
    headerPayload.approval_notes = approvalNotes;
  }

  let poId = input.id;
  const existingLinesById = new Map<string, Record<string, unknown>>();
  if (poId) {
    const { data: existing, error: loadError } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id")
      .eq("id", poId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error("Purchase order not found.");

    const { data: priorLines } = await supabase
      .from("vyron_cost_purchase_order_lines")
      .select("id, received_qty, damaged_qty, rejected_qty, ordered_qty")
      .eq("purchase_order_id", poId)
      .eq("company_id", companyId);
    for (const row of priorLines || []) {
      existingLinesById.set(String(row.id), row as Record<string, unknown>);
    }
  } else {
    const { data, error } = await supabase.from("vyron_cost_purchase_orders").insert(headerPayload).select("id").single();
    if (error) throw new Error(error.message);
    poId = data.id as string;
    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "PO Created",
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: input.po_number,
      detail: `Purchase order ${input.po_number} created.`,
      actor,
    });
  }

  const lineRows = builtLines.map((line, index) => {
    const prior = line.id ? existingLinesById.get(line.id) : undefined;
    const receivedQty = prior ? Number(prior.received_qty || 0) : 0;
    const damagedQty = prior ? Number(prior.damaged_qty || 0) : 0;
    const rejectedQty = prior ? Number(prior.rejected_qty || 0) : 0;
    const outstandingQty = calcPoLineOutstanding({
      ordered_qty: line.quantity,
      received_qty: receivedQty,
      damaged_qty: damagedQty,
      rejected_qty: rejectedQty,
    });
    const outstandingValue =
      line.quantity > 0 ? Math.round((outstandingQty / line.quantity) * line.line_total * 100) / 100 : 0;
    return {
      ...(line.id && prior ? { id: line.id } : {}),
      company_id: companyId,
      purchase_order_id: poId,
      item_type: line.item_type,
      item_id: line.item_id || null,
      item_name: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      vat_rate: line.vat_rate ?? 15,
      vat_amount: line.vat_amount,
      line_total: line.line_total,
      expected_delivery_date: line.expected_delivery_date || null,
      ordered_qty: line.quantity,
      received_qty: receivedQty,
      damaged_qty: damagedQty,
      rejected_qty: rejectedQty,
      outstanding_qty: outstandingQty,
      sort_order: index,
      _outstandingValue: outstandingValue,
    };
  });

  if (input.id && poId) {
    headerPayload = {
      ...headerPayload,
      outstanding_amount:
        Math.round(lineRows.reduce((sum, row) => sum + Number(row._outstandingValue || 0), 0) * 100) / 100,
    };
    const { error } = await supabase
      .from("vyron_cost_purchase_orders")
      .update(headerPayload)
      .eq("id", poId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await supabase
      .from("vyron_cost_purchase_order_lines")
      .delete()
      .eq("purchase_order_id", poId)
      .eq("company_id", companyId);
  }

  const insertRows = lineRows.map(({ _outstandingValue, ...row }) => row);

  const { error: lineError } = await supabase.from("vyron_cost_purchase_order_lines").insert(insertRows);
  if (lineError) throw new Error(lineError.message);

  return getPurchaseOrderDetail(supabase, poId!, companyId);
}

export async function deletePurchaseOrder(supabase: SupabaseClient, companyId: string, poId: string) {
  const { data: existing, error: loadError } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id")
    .eq("id", poId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Purchase order not found.");

  const { count: grnCount, error: grnCountError } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", poId)
    .eq("company_id", companyId);
  if (grnCountError) throw new Error(grnCountError.message);
  if ((grnCount || 0) > 0) {
    throw new Error("Cannot delete purchase order with linked goods receipts. Remove or reverse receipts first.");
  }

  await supabase
    .from("vyron_cost_purchase_order_lines")
    .delete()
    .eq("purchase_order_id", poId)
    .eq("company_id", companyId);

  const { error } = await supabase
    .from("vyron_cost_purchase_orders")
    .delete()
    .eq("id", poId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function transitionPurchaseOrder(
  supabase: SupabaseClient,
  poId: string,
  status: string,
  companyId: string,
  opts?: { approvedBy?: string; approvalNotes?: string; actor?: string }
) {
  const existing = await getPurchaseOrderDetail(supabase, poId, companyId);
  if (!existing) throw new Error("Purchase order not found.");

  const rules = await getPoApprovalRules(supabase, companyId);
  const approvalTier = approvalTierForTotal(Number(existing.total || 0), rules);
  let nextStatus = status;
  if (status === "Submitted" && approvalTier === "auto") {
    nextStatus = "Approved";
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (nextStatus === "Submitted" || status === "Submitted") {
    patch.submitted_at = new Date().toISOString();
  }
  if (nextStatus === "Approved") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = opts?.approvedBy || opts?.actor || "supervisor";
    const tierNote =
      approvalTier === "auto" ? "Auto-approved below threshold." : `${approvalTier} approval tier`;
    patch.approval_notes = opts?.approvalNotes ? `${opts.approvalNotes} · ${tierNote}` : tierNote;
  }
  if (nextStatus === "Sent") patch.sent_at = new Date().toISOString();
  if (nextStatus === "Closed") patch.closed_at = new Date().toISOString();

  const { data: po, error } = await supabase
    .from("vyron_cost_purchase_orders")
    .update(patch)
    .eq("id", poId)
    .eq("company_id", companyId)
    .select("company_id, po_number")
    .single();
  if (error) throw new Error(error.message);

  const eventMap: Record<string, string> = {
    Submitted: "PO Submitted",
    Approved: "PO Approved",
    Sent: "PO Sent",
    Closed: "PO Closed",
    Cancelled: "PO Cancelled",
  };
  const auditStatus = nextStatus;
  if (eventMap[auditStatus]) {
    await writeProcurementAudit(supabase, {
      companyId: po.company_id as string,
      eventType: eventMap[auditStatus],
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: po.po_number as string,
      detail: `${po.po_number} moved to ${auditStatus} (${approvalTier} tier).`,
      actor: opts?.actor || opts?.approvedBy || "system",
    });
  }
  const purchaseOrder = await getPurchaseOrderDetail(supabase, poId, companyId);
  return { purchaseOrder, approvalTier };
}

type PoLineSnapshot = {
  id: string;
  received_qty: number;
  damaged_qty: number;
  rejected_qty: number;
  outstanding_qty: number;
};

export async function recalculatePoLinesFromActiveGrns(
  supabase: SupabaseClient,
  companyId: string,
  purchaseOrderId: string
) {
  const { data: poLines, error: poLineError } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", companyId);
  if (poLineError) throw new Error(poLineError.message);

  const { data: activeGrns, error: grnError } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", companyId)
    .eq("status", "Posted");
  if (grnError) throw new Error(grnError.message);

  const activeGrnIds = (activeGrns || []).map((row) => String(row.id));
  const { data: receiptLines, error: receiptLineError } = activeGrnIds.length
    ? await supabase
        .from("vyron_cost_goods_receipt_lines")
        .select("purchase_order_line_id, received_qty, damaged_qty, rejected_qty")
        .eq("company_id", companyId)
        .in("goods_receipt_id", activeGrnIds)
    : { data: [], error: null };
  if (receiptLineError) throw new Error(receiptLineError.message);

  const sumsByPoLine = new Map<string, { received: number; damaged: number; rejected: number }>();
  for (const row of receiptLines || []) {
    const poLineId = String(row.purchase_order_line_id || "");
    if (!poLineId) continue;
    const existing = sumsByPoLine.get(poLineId) || { received: 0, damaged: 0, rejected: 0 };
    existing.received += Number(row.received_qty || 0);
    existing.damaged += Number(row.damaged_qty || 0);
    existing.rejected += Number(row.rejected_qty || 0);
    sumsByPoLine.set(poLineId, existing);
  }

  for (const poLine of poLines || []) {
    const sums = sumsByPoLine.get(String(poLine.id)) || { received: 0, damaged: 0, rejected: 0 };
    const outstanding = calcPoLineOutstanding({
      ordered_qty: poLine.ordered_qty,
      received_qty: sums.received,
      damaged_qty: sums.damaged,
      rejected_qty: sums.rejected,
    });
    const { error } = await supabase
      .from("vyron_cost_purchase_order_lines")
      .update({
        received_qty: sums.received,
        damaged_qty: sums.damaged,
        rejected_qty: sums.rejected,
        outstanding_qty: outstanding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poLine.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
}

export async function refreshPurchaseOrderReceiptState(
  supabase: SupabaseClient,
  companyId: string,
  purchaseOrderId: string,
  supplierId?: string | null,
  supplierNameSnapshot?: string | null
) {
  await recalculatePoLinesFromActiveGrns(supabase, companyId, purchaseOrderId);

  const { data: poLines, error: poLineError } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("id, item_name, ordered_qty, received_qty, outstanding_qty")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", companyId);
  if (poLineError) throw new Error(poLineError.message);

  const lines = poLines || [];
  const allReceived = lines.every((line) => Number(line.received_qty || 0) >= Number(line.ordered_qty || 0) - 0.001);
  const anyReceived = lines.some((line) => Number(line.received_qty || 0) > 0);
  const { data: po, error: poError } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("status")
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (poError) throw new Error(poError.message);

  const fallbackStatus = String(po?.status || "Approved");
  const newStatus = allReceived
    ? "Fully Received"
    : anyReceived
      ? "Partially Received"
      : ["Partially Received", "Fully Received"].includes(fallbackStatus)
        ? "Approved"
        : fallbackStatus;

  const { error: statusError } = await supabase
    .from("vyron_cost_purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId);
  if (statusError) throw new Error(statusError.message);

  const { error: backOrderDeleteError } = await supabase
    .from("vyron_cost_back_orders")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", companyId)
    .eq("status", "Open");
  if (backOrderDeleteError) throw new Error(backOrderDeleteError.message);

  for (const poLine of lines) {
    if (Number(poLine.outstanding_qty || 0) <= 0.001) continue;
    const { error } = await supabase.from("vyron_cost_back_orders").insert({
      company_id: companyId,
      purchase_order_id: purchaseOrderId,
      purchase_order_line_id: poLine.id,
      supplier_id: supplierId || null,
      supplier_name_snapshot: supplierNameSnapshot || null,
      item_name: poLine.item_name,
      outstanding_qty: Number(poLine.outstanding_qty || 0),
      expected_date: null,
      status: "Open",
    });
    if (error) throw new Error(error.message);
  }
}

async function rollbackFailedGrnCreation(
  supabase: SupabaseClient,
  companyId: string,
  ctx: {
    grnId: string;
    purchaseOrderId: string;
    poLineSnapshots: PoLineSnapshot[];
    poStatusBefore: string;
    supplierId?: string | null;
    supplierNameSnapshot?: string | null;
  }
) {
  await rollbackGrnStockPostings(supabase, companyId, ctx.grnId);
  await supabase.from("vyron_cost_goods_receipt_lines").delete().eq("goods_receipt_id", ctx.grnId).eq("company_id", companyId);
  await supabase.from("vyron_cost_goods_receipts").delete().eq("id", ctx.grnId).eq("company_id", companyId);

  for (const snap of ctx.poLineSnapshots) {
    await supabase
      .from("vyron_cost_purchase_order_lines")
      .update({
        received_qty: snap.received_qty,
        damaged_qty: snap.damaged_qty,
        rejected_qty: snap.rejected_qty,
        outstanding_qty: snap.outstanding_qty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", snap.id)
      .eq("company_id", companyId);
  }

  await supabase
    .from("vyron_cost_purchase_orders")
    .update({ status: ctx.poStatusBefore, updated_at: new Date().toISOString() })
    .eq("id", ctx.purchaseOrderId)
    .eq("company_id", companyId);

  await refreshPurchaseOrderReceiptState(
    supabase,
    companyId,
    ctx.purchaseOrderId,
    ctx.supplierId,
    ctx.supplierNameSnapshot
  );
}

export async function reverseGoodsReceipt(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string,
  input: { reason: string; actor?: string }
) {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Reversal reason is required.");

  const { data: grn, error: grnError } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*")
    .eq("id", grnId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (grnError) throw new Error(grnError.message);
  if (!grn) throw new Error("GRN not found.");

  const status = String(grn.status || "Posted");
  if (status === "Reversed") throw new Error("GRN has already been reversed.");
  if (status === "Cancelled") throw new Error("Cannot reverse a cancelled GRN.");

  const actor = input.actor || "user";
  const grnNumber = String(grn.grn_number || grnId);

  const stockPosted = await hasGrnPostedStock(supabase, companyId, grnId);
  if (stockPosted) {
    await reverseStockFromGrn(supabase, {
      companyId,
      grnId,
      grnNumber,
      reason,
      actor,
    });
  }

  const reversalNote = `Reversed: ${reason}`;
  const nextNotes = grn.notes ? `${grn.notes}\n${reversalNote}` : reversalNote;
  const { data: reversedGrn, error: updateError } = await supabase
    .from("vyron_cost_goods_receipts")
    .update({
      status: "Reversed",
      notes: nextNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", grnId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  if (grn.purchase_order_id) {
    await refreshPurchaseOrderReceiptState(
      supabase,
      companyId,
      String(grn.purchase_order_id),
      grn.supplier_id as string | null,
      grn.supplier_name_snapshot as string | null
    );
  }

  await writeProcurementAudit(supabase, {
    companyId,
    eventType: "GRN Reversed",
    entityType: "goods_receipt",
    entityId: grnId,
    entityLabel: grnNumber,
    detail: `${grnNumber} reversed — ${reason}`,
    actor,
    metadata: { reason, originalStatus: status },
  });

  return { grn: reversedGrn, grnNumber };
}

export async function createGoodsReceipt(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    purchase_order_id: string;
    receipt_type: "full" | "partial";
    received_by?: string;
    notes?: string;
    lines: GrnLineInput[];
  },
  actor = "user"
) {
  const po = await getPurchaseOrderDetail(supabase, input.purchase_order_id, companyId);
  if (!po) throw new Error("Purchase order not found.");

  validateGoodsReceiptInput(po, input);

  const poLineSnapshots: PoLineSnapshot[] = (po.lines || []).map((line) => ({
    id: String(line.id),
    received_qty: Number(line.received_qty || 0),
    damaged_qty: Number(line.damaged_qty || 0),
    rejected_qty: Number(line.rejected_qty || 0),
    outstanding_qty: Number(line.outstanding_qty || 0),
  }));
  const poStatusBefore = String(po.status);

  const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;
  let grnId: string | null = null;

  try {
    const { data: grn, error: grnError } = await supabase
      .from("vyron_cost_goods_receipts")
      .insert({
        company_id: companyId,
        purchase_order_id: input.purchase_order_id,
        grn_number: grnNumber,
        supplier_id: po.supplier_id,
        supplier_name_snapshot: po.supplier_name_snapshot,
        receipt_type: input.receipt_type,
        status: "Posted",
        received_by: input.received_by || actor,
        notes: input.notes || null,
      })
      .select("*")
      .single();
    if (grnError) throw new Error(grnError.message);
    grnId = String(grn.id);

    const grnLines = input.lines.map((line) => {
      const poLine = line.purchase_order_line_id ? po.lines?.find((l) => l.id === line.purchase_order_line_id) : null;
      const outstandingBefore = poLine
        ? calcPoLineOutstanding(poLine)
        : calcPoLineOutstanding({ ordered_qty: line.ordered_qty });
      const lineTotal = line.received_qty + (line.damaged_qty || 0) + (line.rejected_qty || 0);
      const outstanding = Math.max(0, outstandingBefore - lineTotal);
      return {
        company_id: companyId,
        goods_receipt_id: grn.id,
        purchase_order_line_id: line.purchase_order_line_id || null,
        item_name: line.item_name,
        ordered_qty: line.ordered_qty,
        received_qty: line.received_qty,
        damaged_qty: line.damaged_qty || 0,
        rejected_qty: line.rejected_qty || 0,
        outstanding_qty: outstanding,
        unit: line.unit,
      };
    });

    const { error: lineErr } = await supabase.from("vyron_cost_goods_receipt_lines").insert(grnLines);
    if (lineErr) throw new Error(lineErr.message);

    for (const line of input.lines) {
      if (!line.purchase_order_line_id) continue;
      const poLine = po.lines?.find((l) => l.id === line.purchase_order_line_id);
      if (!poLine) continue;
      const newReceived = Number(poLine.received_qty) + line.received_qty;
      const newDamaged = Number(poLine.damaged_qty) + (line.damaged_qty || 0);
      const newRejected = Number(poLine.rejected_qty) + (line.rejected_qty || 0);
      const outstanding = calcPoLineOutstanding({
        ordered_qty: poLine.ordered_qty,
        received_qty: newReceived,
        damaged_qty: newDamaged,
        rejected_qty: newRejected,
      });
      const { error: poLineError } = await supabase
        .from("vyron_cost_purchase_order_lines")
        .update({
          received_qty: newReceived,
          damaged_qty: newDamaged,
          rejected_qty: newRejected,
          outstanding_qty: outstanding,
          updated_at: new Date().toISOString(),
        })
        .eq("id", line.purchase_order_line_id)
        .eq("company_id", companyId);
      if (poLineError) throw new Error(poLineError.message);
    }

    await refreshPurchaseOrderReceiptState(
      supabase,
      companyId,
      input.purchase_order_id,
      po.supplier_id,
      po.supplier_name_snapshot
    );

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "Goods Received",
      entityType: "goods_receipt",
      entityId: grn.id as string,
      entityLabel: grnNumber,
      detail: `${grnNumber} posted for ${po.po_number}.`,
      actor,
      metadata: { receipt_type: input.receipt_type },
    });

    await receiveStockFromGrn(supabase, {
      companyId,
      grnId: grn.id as string,
      grnNumber,
      purchaseOrderId: input.purchase_order_id,
      lines: input.lines.map((line) => {
        const poLine = line.purchase_order_line_id ? po.lines?.find((l) => l.id === line.purchase_order_line_id) : null;
        return {
          purchase_order_line_id: line.purchase_order_line_id,
          item_name: line.item_name,
          received_qty: line.received_qty,
          unit: line.unit,
          item_type: poLine?.item_type,
          item_id: poLine?.item_id,
          unit_price: poLine ? Number(poLine.unit_price) : undefined,
        };
      }),
      actor,
    });

    return { grn, grnNumber };
  } catch (error) {
    if (grnId) {
      await rollbackFailedGrnCreation(supabase, companyId, {
        grnId,
        purchaseOrderId: input.purchase_order_id,
        poLineSnapshots,
        poStatusBefore,
        supplierId: po.supplier_id,
        supplierNameSnapshot: po.supplier_name_snapshot,
      });
    }
    throw error;
  }
}

export async function listGoodsReceipts(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*, vyron_cost_purchase_orders(po_number)")
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listBackOrders(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from("vyron_cost_back_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function linkDocumentToPurchaseOrder(
  supabase: SupabaseClient,
  params: { documentId: string; purchaseOrderId: string; actor?: string }
) {
  const { data: po } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, company_id, po_number, supplier_name_snapshot, total, outstanding_amount")
    .eq("id", params.purchaseOrderId)
    .maybeSingle();
  if (!po) throw new Error("Purchase order not found.");

  const { error } = await supabase
    .from("vyron_documents")
    .update({
      purchase_order_id: params.purchaseOrderId,
      purchase_order_number: po.po_number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.documentId);
  if (error) throw new Error(error.message);

  const match = await computeThreeWayMatch(supabase, {
    companyId: po.company_id as string,
    documentId: params.documentId,
    purchaseOrderId: params.purchaseOrderId,
  });
  await upsertThreeWayMatch(supabase, po.company_id as string, params.documentId, params.purchaseOrderId, match);

  await writeProcurementAudit(supabase, {
    companyId: po.company_id as string,
    eventType: "Invoice Linked",
    entityType: "document",
    entityId: params.documentId,
    entityLabel: po.po_number as string,
    detail: `Invoice linked to ${po.po_number}. Match: ${match.matchStatus}.`,
    actor: params.actor || "user",
  });

  return { po, match };
}

export async function getSupplierProcurementStats(supabase: SupabaseClient, supplierId: string, companyId = VYRON_DEFAULT_TENANT_ID) {
  const monthStart = new Date();
  monthStart.setDate(1);
  const yearStart = new Date(monthStart.getFullYear(), 0, 1);

  const { data: supplierRow } = await supabase
    .from("vyron_cost_suppliers")
    .select("supplier_name")
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!supplierRow) {
    return {
      poCount: 0,
      grnCount: 0,
      invoiceCount: 0,
      spendThisMonth: 0,
      spendThisYear: 0,
      averageVariancePercent: 0,
    };
  }

  const supplierName = String(supplierRow.supplier_name || "").toLowerCase();

  const [{ count: poCount }, { count: grnCount }, { data: invoices }, { data: pos }] = await Promise.all([
    supabase
      .from("vyron_cost_purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("vyron_cost_goods_receipts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("vyron_documents")
      .select("id, total, created_at, supplier_name")
      .eq("tenant_id", companyId)
      .is("deleted_at", null)
      .not("status", "eq", "deleted"),
    supabase
      .from("vyron_cost_purchase_orders")
      .select("variance, total, created_at")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
  ]);

  const supplierPos = pos || [];
  const avgVariance =
    supplierPos.length > 0
      ? supplierPos.reduce((s, p) => s + Math.abs(Number(p.variance || 0)), 0) / supplierPos.length
      : 0;

  const invoiceRows = (invoices || []).filter((inv) => {
    if (!supplierName) return false;
    return String(inv.supplier_name || "").toLowerCase().includes(supplierName);
  });

  const spendMonth = invoiceRows
    .filter((inv) => new Date(String(inv.created_at)) >= monthStart)
    .reduce((s, inv) => s + Number(inv.total || 0), 0);
  const spendYear = invoiceRows
    .filter((inv) => new Date(String(inv.created_at)) >= yearStart)
    .reduce((s, inv) => s + Number(inv.total || 0), 0);

  return {
    poCount: poCount || 0,
    grnCount: grnCount || 0,
    invoiceCount: invoiceRows.length,
    spendThisMonth: Math.round(spendMonth * 100) / 100,
    spendThisYear: Math.round(spendYear * 100) / 100,
    averageVariancePercent: supplierPos.length
      ? Math.round((avgVariance / Math.max(1, supplierPos.reduce((s, p) => s + Number(p.total || 1), 0) / supplierPos.length)) * 10000) / 100
      : 0,
  };
}

export async function searchOpenPurchaseOrders(
  supabase: SupabaseClient,
  companyId: string,
  searchTerm?: string | null
) {
  const { data, error } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, po_number, supplier_name_snapshot, status, total, outstanding_amount")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const closedStatuses = new Set(["closed", "cancelled", "fully received", "received"]);
  let rows = (data || []).filter((row) => !closedStatuses.has(String(row.status || "").toLowerCase()));

  if (searchTerm?.trim()) {
    const term = searchTerm.trim().toLowerCase();
    rows = rows.filter((row) =>
      [row.po_number, row.supplier_name_snapshot, row.status, row.total, row.outstanding_amount]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }

  return rows;
}
