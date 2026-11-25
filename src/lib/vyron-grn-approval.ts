import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcPoLineOutstanding,
  getPurchaseOrderDetail,
  GRN_ALLOWED_PO_STATUSES,
  pendingGrnQuantities,
  poLineSnapshotsOf,
  postGoodsReceiptLines,
  restorePurchaseOrderAfterFailedPosting,
  validateGoodsReceiptInput,
  writeProcurementAudit,
  type GrnLineInput,
} from "@/lib/vyron-procurement";
import { hasGrnPostedStock, rollbackGrnStockPostings } from "@/lib/vyron-inventory";

/**
 * GRN approval — individual and bulk.
 *
 * SAFETY, per GRN:
 *  1. Only a GRN in 'Pending Approval' can be approved: approved/posted,
 *     rejected, cancelled and reversed GRNs are refused with their reason.
 *  2. Separation of duties: the member who submitted a GRN cannot approve it.
 *  3. Exceptions (damaged or rejected quantities) are never approved silently:
 *     they need an explicit acknowledgement, which bulk approval never gives.
 *  4. Hard checks are re-run at approval against the purchase order as it is
 *     NOW: PO still receivable, every line linked, quantities within what is
 *     outstanding after other GRNs awaiting approval.
 *  5. Exactly once: the GRN is claimed by a conditional update
 *     (Pending Approval -> Posting). A second, concurrent approval finds no row
 *     to claim and is refused. Stock is posted only after the claim, and only if
 *     the ledger holds no posting for this GRN.
 *  6. Failure undoes stock and the purchase order and returns the GRN to
 *     Pending Approval with the reason.
 * Each GRN is approved and audited individually, also inside a bulk action.
 * No approval value limits are configured in VOLORA, so none are applied.
 */

export class GrnApprovalError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "GrnApprovalError";
    this.status = status;
  }
}

export type GrnApprover = { userId: string; name: string };

export type GrnException = { code: "DAMAGED_OR_REJECTED" | "OVER_RECEIPT" | "PO_NOT_RECEIVABLE" | "UNLINKED_LINE" | "NOTHING_RECEIVED"; blocking: boolean; message: string };

export type PendingGrn = {
  id: string;
  grnNumber: string;
  supplier: string | null;
  poNumber: string | null;
  purchaseOrderId: string | null;
  receivedAt: string | null;
  lineCount: number;
  totalQty: number;
  totalValue: number | null;
  submittedBy: string | null;
  submittedByUserId: string | null;
  submittedAt: string | null;
  status: string;
  pendingApprover: string;
  exceptions: GrnException[];
  canApproveSelf: boolean;
};

type GrnRow = Record<string, unknown> & { id: string; grn_number: string; status: string; purchase_order_id: string | null };
type GrnLineRow = {
  id: string;
  goods_receipt_id: string;
  purchase_order_line_id: string | null;
  item_name: string;
  ordered_qty: number | null;
  received_qty: number | null;
  damaged_qty: number | null;
  rejected_qty: number | null;
  unit: string | null;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

/* ------------------------------------------------------------- settings */

export async function getGrnApprovalSetting(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_grn_approval_settings")
    .select("approval_required, updated_by, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    if (/does not exist|could not find|schema cache/i.test(error.message) || error.code === "PGRST205") {
      return { installed: false, approvalRequired: false, updatedBy: null as string | null, updatedAt: null as string | null };
    }
    throw new Error(error.message);
  }
  return {
    installed: true,
    approvalRequired: data?.approval_required === true,
    updatedBy: (data?.updated_by as string) ?? null,
    updatedAt: (data?.updated_at as string) ?? null,
  };
}

export async function setGrnApprovalRequired(supabase: SupabaseClient, companyId: string, required: boolean, actor: string) {
  const before = await getGrnApprovalSetting(supabase, companyId);
  if (!before.installed) throw new GrnApprovalError("GRN approval is not installed in this database yet.", 503);
  if (!required) {
    const { count } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["Pending Approval", "Posting"]);
    if ((count ?? 0) > 0) {
      throw new GrnApprovalError(`${count} GRN(s) are awaiting approval. Approve or reject them before switching approval off.`);
    }
  }
  const { error } = await supabase
    .from("vyron_grn_approval_settings")
    .upsert({ company_id: companyId, approval_required: required, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (error) throw new Error(error.message);
  await writeProcurementAudit(supabase, {
    companyId,
    eventType: "GRN Approval Setting Changed",
    entityType: "company_setting",
    entityId: companyId,
    entityLabel: "GRN approval required",
    detail: `GRN approval ${required ? "switched ON — new GRNs wait for approval before stock is posted" : "switched OFF — new GRNs post stock on save"}.`,
    actor,
    metadata: { from: before.approvalRequired, to: required },
  });
  return { approvalRequired: required };
}

/* -------------------------------------------------------------- reading */

async function loadLines(supabase: SupabaseClient, companyId: string, grnIds: string[]) {
  const out: GrnLineRow[] = [];
  for (let i = 0; i < grnIds.length; i += 100) {
    const { data, error } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("id, goods_receipt_id, purchase_order_line_id, item_name, ordered_qty, received_qty, damaged_qty, rejected_qty, unit")
      .eq("company_id", companyId)
      .in("goods_receipt_id", grnIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    out.push(...((data || []) as GrnLineRow[]));
  }
  return out;
}

/** Exceptions of one pending GRN against its purchase order as it stands now. */
async function assessGrn(
  supabase: SupabaseClient,
  companyId: string,
  grn: GrnRow,
  lines: GrnLineRow[]
): Promise<{ exceptions: GrnException[]; value: number | null; poNumber: string | null }> {
  const exceptions: GrnException[] = [];
  const po = grn.purchase_order_id ? await getPurchaseOrderDetail(supabase, String(grn.purchase_order_id), companyId) : null;
  if (!po) {
    exceptions.push({ code: "PO_NOT_RECEIVABLE", blocking: true, message: "The purchase order no longer exists." });
    return { exceptions, value: null, poNumber: null };
  }
  if (!GRN_ALLOWED_PO_STATUSES.includes(String(po.status) as (typeof GRN_ALLOWED_PO_STATUSES)[number])) {
    exceptions.push({ code: "PO_NOT_RECEIVABLE", blocking: true, message: `Purchase order ${po.po_number} is ${po.status} and can no longer be received against.` });
  }
  const pending = await pendingGrnQuantities(supabase, companyId, String(po.id), grn.id);
  let value = 0;
  let valueKnown = true;
  let total = 0;
  for (const l of lines) {
    const moved = n(l.received_qty) + n(l.damaged_qty) + n(l.rejected_qty);
    total += moved;
    if (!l.purchase_order_line_id) {
      if (moved > 0) exceptions.push({ code: "UNLINKED_LINE", blocking: true, message: `${l.item_name} is not linked to a purchase order line.` });
      continue;
    }
    const poLine = po.lines?.find((p) => String(p.id) === String(l.purchase_order_line_id));
    if (!poLine) {
      exceptions.push({ code: "UNLINKED_LINE", blocking: true, message: `${l.item_name}: its purchase order line no longer exists.` });
      continue;
    }
    const available = calcPoLineOutstanding(poLine) - (pending.get(String(l.purchase_order_line_id)) || 0);
    if (moved > available + 0.001) {
      exceptions.push({
        code: "OVER_RECEIPT",
        blocking: true,
        message: `${l.item_name}: ${moved} received but only ${Math.max(0, available)} outstanding on ${po.po_number} (after other GRNs awaiting approval).`,
      });
    }
    if (n(l.damaged_qty) > 0 || n(l.rejected_qty) > 0) {
      exceptions.push({
        code: "DAMAGED_OR_REJECTED",
        blocking: false,
        message: `${l.item_name}: ${n(l.damaged_qty)} damaged, ${n(l.rejected_qty)} rejected — review before approving.`,
      });
    }
    const price = Number(poLine.unit_price ?? 0);
    if (price > 0) value += n(l.received_qty) * price;
    else valueKnown = false;
  }
  if (total <= 0) exceptions.push({ code: "NOTHING_RECEIVED", blocking: true, message: "No quantity is recorded on any line." });
  return { exceptions, value: valueKnown ? Math.round(value * 100) / 100 : null, poNumber: String(po.po_number) };
}

export async function listPendingGrnApprovals(
  supabase: SupabaseClient,
  companyId: string,
  viewerUserId: string | null
): Promise<PendingGrn[]> {
  const { data, error } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["Pending Approval", "Posting"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    if (/submitted_by|does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const grns = (data || []) as GrnRow[];
  const lines = await loadLines(supabase, companyId, grns.map((g) => String(g.id)));
  const out: PendingGrn[] = [];
  for (const g of grns) {
    const own = lines.filter((l) => String(l.goods_receipt_id) === String(g.id));
    const { exceptions, value, poNumber } = await assessGrn(supabase, companyId, g, own);
    const submitterId = (g.submitted_by_user_id as string) ?? null;
    out.push({
      id: String(g.id),
      grnNumber: String(g.grn_number),
      supplier: (g.supplier_name_snapshot as string) ?? null,
      poNumber,
      purchaseOrderId: g.purchase_order_id ? String(g.purchase_order_id) : null,
      receivedAt: (g.received_at as string) ?? (g.created_at as string) ?? null,
      lineCount: own.length,
      totalQty: Math.round(own.reduce((s, l) => s + n(l.received_qty), 0) * 10000) / 10000,
      totalValue: value,
      submittedBy: (g.submitted_by as string) ?? null,
      submittedByUserId: submitterId,
      submittedAt: (g.submitted_at as string) ?? null,
      status: String(g.status),
      pendingApprover: "Any member with Approve GRNs permission other than the submitter",
      exceptions,
      canApproveSelf: !!viewerUserId && viewerUserId === submitterId,
    });
  }
  return out;
}

/* ------------------------------------------------------------- deciding */

export type GrnApprovalResult = { id: string; grnNumber: string | null; ok: boolean; error?: string; status?: string };

export async function approveGoodsReceipt(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string,
  approver: GrnApprover,
  options: { acknowledgeExceptions?: boolean; note?: string } = {}
): Promise<GrnApprovalResult> {
  const { data: grn, error } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*")
    .eq("id", grnId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!grn) throw new GrnApprovalError("GRN not found.", 404);
  const g = grn as GrnRow;
  const label = String(g.grn_number || grnId);
  const status = String(g.status);

  if (status !== "Pending Approval") {
    const why: Record<string, string> = {
      Posted: "it is already approved and posted",
      Posting: "another user is approving it right now",
      Rejected: "it was rejected",
      Cancelled: "it is cancelled",
      Reversed: "it was reversed",
    };
    throw new GrnApprovalError(`${label} cannot be approved: ${why[status] ?? `its status is ${status}`}.`);
  }
  if (g.submitted_by_user_id && String(g.submitted_by_user_id) === approver.userId) {
    throw new GrnApprovalError(`${label}: you submitted this GRN, so another authorised user must approve it (separation of duties).`, 403);
  }

  const lines = await loadLines(supabase, companyId, [grnId]);
  const { exceptions } = await assessGrn(supabase, companyId, g, lines);
  const blocking = exceptions.filter((e) => e.blocking);
  if (blocking.length) throw new GrnApprovalError(`${label} cannot be approved: ${blocking.map((e) => e.message).join(" ")}`);
  const review = exceptions.filter((e) => !e.blocking);
  if (review.length && !options.acknowledgeExceptions) {
    throw new GrnApprovalError(
      `${label} has exceptions that must be reviewed and approved individually: ${review.map((e) => e.message).join(" ")}`
    );
  }

  /* Claim: exactly one approver can move it out of Pending Approval. */
  const { data: claimed, error: claimError } = await supabase
    .from("vyron_cost_goods_receipts")
    .update({ status: "Posting", updated_at: new Date().toISOString() })
    .eq("id", grnId)
    .eq("company_id", companyId)
    .eq("status", "Pending Approval")
    .select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) throw new GrnApprovalError(`${label} was approved or changed by another user a moment ago.`);

  const release = async (reason: string) => {
    await supabase
      .from("vyron_cost_goods_receipts")
      .update({ status: "Pending Approval", updated_at: new Date().toISOString() })
      .eq("id", grnId)
      .eq("company_id", companyId)
      .eq("status", "Posting");
    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "GRN Approval Failed",
      entityType: "goods_receipt",
      entityId: grnId,
      entityLabel: label,
      detail: `${label} approval failed and was undone: ${reason}`,
      actor: approver.name,
      metadata: { approverUserId: approver.userId },
    });
  };

  if (await hasGrnPostedStock(supabase, companyId, grnId)) {
    await release("stock is already posted for this GRN");
    throw new GrnApprovalError(`${label}: stock is already posted for this GRN, so it was not posted again.`);
  }

  const po = await getPurchaseOrderDetail(supabase, String(g.purchase_order_id), companyId);
  if (!po) {
    await release("purchase order not found");
    throw new GrnApprovalError(`${label}: the purchase order no longer exists.`);
  }
  const input: GrnLineInput[] = lines.map((l) => ({
    purchase_order_line_id: l.purchase_order_line_id || undefined,
    item_name: l.item_name,
    ordered_qty: n(l.ordered_qty),
    received_qty: n(l.received_qty),
    damaged_qty: n(l.damaged_qty),
    rejected_qty: n(l.rejected_qty),
    unit: String(l.unit || ""),
  })) as GrnLineInput[];
  try {
    validateGoodsReceiptInput(po, { lines: input });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "validation failed";
    await release(reason);
    throw new GrnApprovalError(`${label} cannot be approved: ${reason}`);
  }

  const snapshots = poLineSnapshotsOf(po);
  const poStatusBefore = String(po.status);
  const now = new Date().toISOString();
  try {
    /* Posted first: the PO recalculation counts Posted GRNs only. */
    const { data: posted, error: postError } = await supabase
      .from("vyron_cost_goods_receipts")
      .update({
        status: "Posted",
        approved_by: approver.name,
        approved_by_user_id: approver.userId,
        approved_at: now,
        approval_exceptions: review.length ? review : null,
        updated_at: now,
      })
      .eq("id", grnId)
      .eq("company_id", companyId)
      .eq("status", "Posting")
      .select("id");
    if (postError) throw new Error(postError.message);
    if (!posted || posted.length === 0) throw new Error("the GRN left the Posting state unexpectedly");

    await postGoodsReceiptLines(supabase, companyId, {
      grnId,
      grnNumber: label,
      po,
      lines: input,
      receiptType: String(g.receipt_type || "partial"),
      actor: approver.name,
      auditEventType: "GRN Approved",
      auditDetail: `${label} approved by ${approver.name} and posted for ${po.po_number}.${
        review.length ? ` Exceptions acknowledged: ${review.map((e) => e.message).join(" ")}` : ""
      }${options.note ? ` Note: ${options.note}` : ""}`,
      auditMetadata: {
        approverUserId: approver.userId,
        submittedBy: g.submitted_by ?? null,
        submittedByUserId: g.submitted_by_user_id ?? null,
        acknowledgedExceptions: review,
        at: now,
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "posting failed";
    await rollbackGrnStockPostings(supabase, companyId, grnId);
    await supabase
      .from("vyron_cost_goods_receipts")
      .update({ status: "Posting", approved_by: null, approved_by_user_id: null, approved_at: null, approval_exceptions: null })
      .eq("id", grnId)
      .eq("company_id", companyId);
    await restorePurchaseOrderAfterFailedPosting(supabase, companyId, po, snapshots, poStatusBefore);
    await release(reason);
    throw new GrnApprovalError(`${label} was not approved — posting failed and was undone: ${reason}`, 500);
  }
  return { id: grnId, grnNumber: label, ok: true, status: "Posted" };
}

export async function rejectGoodsReceipt(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string,
  approver: GrnApprover,
  reason: string
): Promise<GrnApprovalResult> {
  const why = String(reason || "").trim();
  if (why.length < 5) throw new GrnApprovalError("Give a reason for rejecting the GRN.", 400);
  const { data, error } = await supabase
    .from("vyron_cost_goods_receipts")
    .update({
      status: "Rejected",
      rejected_by: approver.name,
      rejected_by_user_id: approver.userId,
      rejected_at: new Date().toISOString(),
      rejection_reason: why,
      updated_at: new Date().toISOString(),
    })
    .eq("id", grnId)
    .eq("company_id", companyId)
    .eq("status", "Pending Approval")
    .select("id, grn_number");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new GrnApprovalError("Only a GRN awaiting approval can be rejected.");
  const label = String(data[0].grn_number || grnId);
  await writeProcurementAudit(supabase, {
    companyId,
    eventType: "GRN Rejected",
    entityType: "goods_receipt",
    entityId: grnId,
    entityLabel: label,
    detail: `${label} rejected by ${approver.name}: ${why}. No stock or purchase order change.`,
    actor: approver.name,
    metadata: { approverUserId: approver.userId, reason: why },
  });
  return { id: grnId, grnNumber: label, ok: true, status: "Rejected" };
}

/**
 * Approve several GRNs. Each is processed and audited on its own; one failure
 * never marks the others successful or failed. Bulk approval never
 * acknowledges exceptions — a GRN with exceptions fails with its reason.
 */
export async function bulkApproveGoodsReceipts(
  supabase: SupabaseClient,
  companyId: string,
  grnIds: string[],
  approver: GrnApprover
): Promise<{ succeeded: GrnApprovalResult[]; failed: GrnApprovalResult[] }> {
  const ids = [...new Set(grnIds.map((s) => String(s).trim()).filter(Boolean))].slice(0, 200);
  const succeeded: GrnApprovalResult[] = [];
  const failed: GrnApprovalResult[] = [];
  for (const id of ids) {
    try {
      succeeded.push(await approveGoodsReceipt(supabase, companyId, id, approver, { acknowledgeExceptions: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approval failed.";
      const { data } = await supabase.from("vyron_cost_goods_receipts").select("grn_number").eq("id", id).eq("company_id", companyId).maybeSingle();
      failed.push({ id, grnNumber: (data?.grn_number as string) ?? null, ok: false, error: message });
    }
  }
  return { succeeded, failed };
}
