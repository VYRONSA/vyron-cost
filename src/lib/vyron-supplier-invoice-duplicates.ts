import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteSupplierInvoice, getSupplierInvoice, listSupplierInvoiceRegister, type SupplierInvoiceRegisterRow } from "@/lib/vyron-supplier-invoices";
import { supplierInvoiceLinkKey } from "@/lib/vyron-supplier-invoice-uniqueness";

/**
 * VOLORA — review and resolve supplier invoices captured more than once.
 *
 * Detection is the register's own (same supplier + invoice number). This adds the review and the
 * resolution, with these rules:
 *  - Only register invoices (vyron_cost_supplier_invoices) are resolved here. An Invoice
 *    Intelligence document is changed only through its own document workflow; it is listed with a
 *    link to it.
 *  - The last remaining (non-cancelled) copy of an invoice can never be voided or deleted here.
 *  - VOID (default): status → Cancelled. The record and its lines are kept; Cancelled invoices are
 *    already excluded from purchases, reports and duplicate checks for new captures. Refused when
 *    the invoice is Posted or Paid, or stock movements reference it.
 *  - DELETE: only a Draft/Captured invoice with no dependencies at all (not Posted/Paid, no stock
 *    movements, no matched purchase order). A full snapshot (header + lines) is written to the
 *    audit log first, so the deletion is recorded in full.
 *  - Every action needs a reason (10+ characters) and records the member's name and the time.
 */

export class DuplicateResolutionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type DuplicateInvoiceRow = SupplierInvoiceRegisterRow & {
  role: "original" | "duplicate" | "voided";
  lineCount: number;
  dependencies: string[];
  canVoid: boolean;
  canDelete: boolean;
  blockedReason: string | null;
};

export type DuplicateInvoiceGroup = {
  key: string;
  supplierName: string;
  invoiceNumber: string;
  rows: DuplicateInvoiceRow[];
  amountsDiffer: boolean;
  datesDiffer: boolean;
  /** No action needed: at most one copy is still active. */
  resolved: boolean;
};

const isCancelled = (status: string | null | undefined) => /^cancel/i.test(String(status || "").trim());
const isLocked = (status: string | null | undefined) => /^(posted|paid)$/i.test(String(status || "").trim());
const isDraftLike = (status: string | null | undefined) => /^(draft|captured|)$/i.test(String(status || "").trim());

/** Pure: group register rows into duplicate sets and decide what may be done to each row. */
export function buildDuplicateGroups(
  rows: SupplierInvoiceRegisterRow[],
  lineCounts: Record<string, number>,
  ledgerRefs: Record<string, number>
): DuplicateInvoiceGroup[] {
  const groups = new Map<string, SupplierInvoiceRegisterRow[]>();
  for (const row of rows) {
    const key = supplierInvoiceLinkKey(row.supplier_name, row.invoice_number);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const out: DuplicateInvoiceGroup[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const ordered = [...members].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
    const active = ordered.filter((r) => !isCancelled(r.status));
    const originalId = active[0]?.id ?? null;
    const resultRows: DuplicateInvoiceRow[] = ordered.map((r) => {
      const deps: string[] = [];
      if (r.origin === "document") deps.push("Approved in Invoice Intelligence — resolve it in the document workflow");
      if (isLocked(r.status)) deps.push(`Status ${r.status}`);
      if ((ledgerRefs[r.id] || 0) > 0) deps.push(`${ledgerRefs[r.id]} stock movement(s) reference it`);
      if (r.matched_po_id) deps.push("Matched to a purchase order");
      if (r.linked_document_id) deps.push("Has a linked Invoice Intelligence document");
      const cancelled = isCancelled(r.status);
      const lastActive = !cancelled && active.length <= 1;
      let blockedReason: string | null = null;
      if (cancelled) blockedReason = "Already voided.";
      else if (lastActive) blockedReason = "This is the only active copy of the invoice.";
      else if (r.origin === "document") blockedReason = "Invoice Intelligence document — open it to void or reverse.";
      else if (isLocked(r.status)) blockedReason = `${r.status} invoices cannot be voided here — reverse the posting first.`;
      else if ((ledgerRefs[r.id] || 0) > 0) blockedReason = "Stock movements reference this invoice — reverse them first.";
      const canVoid = blockedReason === null;
      const canDelete = canVoid && isDraftLike(r.status) && !r.matched_po_id && !r.linked_document_id;
      return {
        ...r,
        role: cancelled ? "voided" : r.id === originalId ? "original" : "duplicate",
        lineCount: lineCounts[r.id] || 0,
        dependencies: deps,
        canVoid,
        canDelete,
        blockedReason,
      };
    });
    const totals = new Set(active.map((r) => (r.total === null ? "null" : Number(r.total).toFixed(2))));
    const dates = new Set(active.map((r) => String(r.invoice_date || "").slice(0, 10)));
    out.push({
      key,
      supplierName: String(ordered[0].supplier_name || "—"),
      invoiceNumber: String(ordered[0].invoice_number || "—"),
      rows: resultRows,
      amountsDiffer: totals.size > 1,
      datesDiffer: dates.size > 1,
      resolved: active.length <= 1,
    });
  }
  return out.sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.supplierName.localeCompare(b.supplierName) || a.invoiceNumber.localeCompare(b.invoiceNumber));
}

async function ledgerReferenceCounts(supabase: SupabaseClient, companyId: string, ids: string[]) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("vyron_cost_stock_ledger").select("reference_id").eq("company_id", companyId).in("reference_id", ids.slice(i, i + 200)).limit(5000);
    if (error) throw new Error(error.message);
    for (const row of data || []) counts[String(row.reference_id)] = (counts[String(row.reference_id)] || 0) + 1;
  }
  return counts;
}

export async function listDuplicateSupplierInvoices(supabase: SupabaseClient, companyId: string) {
  const register = await listSupplierInvoiceRegister(supabase, companyId);
  const flagged = register.invoices.filter((r) => r.duplicate_risk);
  const refs = await ledgerReferenceCounts(supabase, companyId, flagged.filter((r) => r.origin === "register").map((r) => r.id));
  return buildDuplicateGroups(flagged, register.lineCounts, refs);
}

export async function resolveDuplicateSupplierInvoice(
  supabase: SupabaseClient,
  companyId: string,
  input: { invoiceId: string; action: "void" | "delete"; reason: string; actorName: string }
) {
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new DuplicateResolutionError("Give a reason of at least 10 characters.");
  if (input.action !== "void" && input.action !== "delete") throw new DuplicateResolutionError("Unknown action.");

  // Re-derive the group on the server: never trust the screen's view of what is allowed.
  const groups = await listDuplicateSupplierInvoices(supabase, companyId);
  const group = groups.find((g) => g.rows.some((r) => r.id === input.invoiceId && r.origin === "register"));
  if (!group) throw new DuplicateResolutionError("This invoice is not part of a duplicate group in this company.", 404);
  const row = group.rows.find((r) => r.id === input.invoiceId)!;
  if (!row.canVoid) throw new DuplicateResolutionError(row.blockedReason || "This invoice cannot be changed here.", 409);
  if (input.action === "delete" && !row.canDelete)
    throw new DuplicateResolutionError("Only a Draft or Captured invoice with no purchase order or linked document can be deleted. Void it instead — the record is kept.", 409);

  const loaded = await getSupplierInvoice(supabase, companyId, row.id);
  if (!loaded) throw new DuplicateResolutionError("Invoice not found.", 404);
  const others = group.rows.filter((r) => r.id !== row.id && r.role !== "voided").map((r) => ({ id: r.id, origin: r.origin, status: r.status, total: r.total, created_at: r.created_at }));
  const at = new Date().toISOString();
  const snapshot = { invoice: loaded.invoice, lines: loaded.lines, otherCopies: others };

  if (input.action === "void") {
    const note = `[${at.slice(0, 16).replace("T", " ")} UTC] Voided as a duplicate by ${input.actorName}: ${reason}`;
    let update = supabase
      .from("vyron_cost_supplier_invoices")
      .update({ status: "Cancelled", notes: [loaded.invoice.notes, note].filter(Boolean).join("\n"), updated_at: at })
      .eq("id", row.id)
      .eq("company_id", companyId);
    // Compare-and-set on the status read above, so a concurrent post/pay is never overwritten.
    update = loaded.invoice.status === null || loaded.invoice.status === undefined ? update.is("status", null) : update.eq("status", loaded.invoice.status);
    const { data: updated, error } = await update.select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new DuplicateResolutionError("The invoice changed while you were reviewing it. Reload and try again.", 409);
  }

  // Written with an error check (not the fire-and-forget helper): a delete must never happen without its audit record.
  const { error: auditError } = await supabase.from("vyron_inventory_audit_log").insert({
    company_id: companyId,
    stock_item_id: null,
    event_type: input.action === "void" ? "supplier_invoice_duplicate_voided" : "supplier_invoice_duplicate_deleted",
    actor: input.actorName,
    field_name: "status",
    old_value: String(loaded.invoice.status || ""),
    new_value: input.action === "void" ? "Cancelled" : "Deleted",
    detail: `${row.supplier_name || "Supplier"} invoice ${row.invoice_number} (${row.total ?? "no total"}): ${input.action === "void" ? "voided" : "deleted"} as a duplicate. Reason: ${reason}`,
    reference_type: "supplier_invoice",
    reference_id: row.id,
    metadata: { reason, at, snapshot },
  });
  if (auditError) {
    if (input.action === "delete") throw new Error(`Audit record could not be written, so nothing was deleted: ${auditError.message}`);
    console.error("[duplicate-supplier-invoice] void audit write failed", auditError.message);
  }

  if (input.action === "delete") await deleteSupplierInvoice(supabase, companyId, row.id);
  return { ok: true as const, action: input.action, invoiceId: row.id, at };
}
