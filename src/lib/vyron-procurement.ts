import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { receiveStockFromGrn } from "@/lib/vyron-inventory";
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

export type GrnLineInput = {
  purchase_order_line_id?: string | null;
  item_name: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty?: number;
  rejected_qty?: number;
  unit: string;
};

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

export async function getPoApprovalRules(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID): Promise<PoApprovalRules> {
  const { data } = await supabase.from("vyron_po_approval_rules").select("*").eq("company_id", companyId).maybeSingle();
  return {
    autoApproveBelow: Number(data?.auto_approve_below ?? 5000),
    supervisorApproveBelow: Number(data?.supervisor_approve_below ?? 25000),
    requirePoBeforeInvoiceApproval: Boolean(data?.require_po_before_invoice_approval ?? true),
  };
}

export async function savePoApprovalRules(supabase: SupabaseClient, companyId: string, rules: PoApprovalRules) {
  const { error } = await supabase.from("vyron_po_approval_rules").upsert(
    {
      company_id: companyId,
      auto_approve_below: rules.autoApproveBelow,
      supervisor_approve_below: rules.supervisorApproveBelow,
      require_po_before_invoice_approval: rules.requirePoBeforeInvoiceApproval,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) throw new Error(error.message);
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

export async function getPurchaseOrderDetail(supabase: SupabaseClient, poId: string) {
  const { data: po, error } = await supabase.from("vyron_cost_purchase_orders").select("*").eq("id", poId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) return null;

  const { data: lines } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", poId)
    .order("sort_order", { ascending: true });

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

  const headerPayload = {
    company_id: companyId,
    supplier_id: input.supplier_id || null,
    po_number: input.po_number,
    supplier_name_snapshot: input.supplier_name_snapshot,
    status: input.status || "Draft",
    order_date: input.order_date || new Date().toISOString().slice(0, 10),
    notes: input.notes || null,
    subtotal: headerTotals.subtotal,
    vat_amount: headerTotals.vat_amount,
    total: headerTotals.total,
    expected_total: headerTotals.total,
    outstanding_amount: headerTotals.total,
    updated_at: new Date().toISOString(),
  };

  let poId = input.id;
  if (poId) {
    const { error } = await supabase.from("vyron_cost_purchase_orders").update(headerPayload).eq("id", poId);
    if (error) throw new Error(error.message);
    await supabase.from("vyron_cost_purchase_order_lines").delete().eq("purchase_order_id", poId);
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

  const lineRows = builtLines.map((line, index) => ({
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
    received_qty: 0,
    damaged_qty: 0,
    rejected_qty: 0,
    outstanding_qty: line.quantity,
    sort_order: index,
  }));

  const { error: lineError } = await supabase.from("vyron_cost_purchase_order_lines").insert(lineRows);
  if (lineError) throw new Error(lineError.message);

  return getPurchaseOrderDetail(supabase, poId!);
}

export async function transitionPurchaseOrder(
  supabase: SupabaseClient,
  poId: string,
  status: string,
  opts?: { approvedBy?: string; approvalNotes?: string; actor?: string }
) {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "Submitted") patch.submitted_at = new Date().toISOString();
  if (status === "Approved") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = opts?.approvedBy || "supervisor";
    patch.approval_notes = opts?.approvalNotes || null;
  }
  if (status === "Sent") patch.sent_at = new Date().toISOString();
  if (status === "Closed") patch.closed_at = new Date().toISOString();

  const { data: po, error } = await supabase.from("vyron_cost_purchase_orders").update(patch).eq("id", poId).select("company_id, po_number").single();
  if (error) throw new Error(error.message);

  const eventMap: Record<string, string> = {
    Submitted: "PO Submitted",
    Approved: "PO Approved",
    Sent: "PO Sent",
    Closed: "PO Closed",
    Cancelled: "PO Cancelled",
  };
  if (eventMap[status]) {
    await writeProcurementAudit(supabase, {
      companyId: po.company_id as string,
      eventType: eventMap[status],
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: po.po_number as string,
      detail: `${po.po_number} moved to ${status}.`,
      actor: opts?.actor || opts?.approvedBy || "system",
    });
  }
  return getPurchaseOrderDetail(supabase, poId);
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
  const po = await getPurchaseOrderDetail(supabase, input.purchase_order_id);
  if (!po) throw new Error("Purchase order not found.");

  const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;
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

  const grnLines = input.lines.map((line) => {
    const outstanding = Math.max(0, line.ordered_qty - line.received_qty - (line.damaged_qty || 0) - (line.rejected_qty || 0));
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
    const outstanding = Math.max(0, Number(poLine.ordered_qty) - newReceived - (line.damaged_qty || 0) - (line.rejected_qty || 0));
    await supabase
      .from("vyron_cost_purchase_order_lines")
      .update({
        received_qty: newReceived,
        damaged_qty: Number(poLine.damaged_qty) + (line.damaged_qty || 0),
        rejected_qty: Number(poLine.rejected_qty) + (line.rejected_qty || 0),
        outstanding_qty: outstanding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.purchase_order_line_id);

    if (outstanding > 0.001) {
      await supabase.from("vyron_cost_back_orders").insert({
        company_id: companyId,
        purchase_order_id: input.purchase_order_id,
        purchase_order_line_id: line.purchase_order_line_id,
        supplier_id: po.supplier_id,
        supplier_name_snapshot: po.supplier_name_snapshot,
        item_name: line.item_name,
        outstanding_qty: outstanding,
        expected_date: null,
        status: "Open",
      });
    }
  }

  const allReceived = (po.lines || []).every((l) => {
    const inputLine = input.lines.find((x) => x.purchase_order_line_id === l.id);
    const received = inputLine ? Number(l.received_qty) + inputLine.received_qty : Number(l.received_qty);
    return received >= Number(l.ordered_qty) - 0.001;
  });
  const anyReceived = input.lines.some((l) => l.received_qty > 0);
  const newStatus = allReceived ? "Fully Received" : anyReceived ? "Partially Received" : po.status;
  await supabase.from("vyron_cost_purchase_orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", po.id);

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

  try {
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
  } catch (invErr) {
    console.warn("[GRN] inventory receipt failed", invErr);
  }

  return { grn, grnNumber };
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
    .maybeSingle();
  const supplierName = String(supplierRow?.supplier_name || "").toLowerCase();

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
