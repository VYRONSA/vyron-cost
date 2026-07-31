"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { DocumentPdfActions } from "@/components/vyron-platform/documents/DocumentPdfActions";

function poFulfillmentStatus(po: Record<string, unknown>, lines: Array<Record<string, unknown>>) {
  const status = String(po.status || "").toLowerCase();
  if (status.includes("closed")) return "Closed";
  const outstanding = lines.reduce((sum, line) => sum + Number(line.outstanding_qty || 0), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.received_qty || 0), 0);
  if (received <= 0) return "Open";
  if (outstanding > 0) return "Partial";
  return "Closed";
}

export default function ProcurementPoDetailClient({ poId }: { poId: string }) {
  const router = useRouter();
  const { canEdit, canApprove, canDelete } = useModulePermissions("purchase_orders");
  const { canCreate: canReceiveGoods } = useModulePermissions("goods_receipts");
  const [po, setPo] = useState<Record<string, unknown> | null>(null);
  const [goodsReceipts, setGoodsReceipts] = useState<Array<Record<string, unknown>>>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const deleteConfirm = useConfirmDelete("Delete this purchase order? This cannot be undone.");

  const load = useCallback(async () => {
    const { query } = poApiWorkspaceContext();
    const res = await fetch(`/api/purchase-orders/${poId}${query}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setPo(data.purchaseOrder);
      setGoodsReceipts(data.goodsReceipts || []);
      setLinkedInvoices(data.linkedInvoices || []);
    } else setMessage(data.error || "Not found");
  }, [poId]);

  useEffect(() => {
    void load();
  }, [load]);

  function canSetStatus(status: string) {
    if (status === "Approved") return canApprove;
    return canEdit || canApprove;
  }

  function requestDeletePo() {
    if (!canDelete) {
      setMessage("You do not have permission to delete this purchase order.");
      return;
    }
    deleteConfirm.requestDelete(async () => {
      const { query } = poApiWorkspaceContext();
      const res = await fetch(`/api/purchase-orders/${poId}${query}`, { method: "DELETE", cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        router.push("/purchase-orders/list");
        router.refresh();
      } else setMessage(data.error || "Delete failed");
    });
  }

  async function setStatus(status: string) {
    if (!canSetStatus(status)) {
      setMessage("You do not have permission to update this purchase order status.");
      return;
    }
    setPendingStatus(status);
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch(`/api/purchase-orders/${poId}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        approvedBy: "supervisor",
        approvalNotes: `Status → ${status}`,
        ...workspaceBody,
      }),
    });
    const data = await res.json();
    setPendingStatus(null);
    if (data.ok) {
      const tier = data.approvalTier ? ` (${data.approvalTier} tier)` : "";
      setMessage(`PO updated to ${String(data.purchaseOrder?.status || status)}${tier}.`);
      await load();
    } else setMessage(data.error || "Update failed");
  }

  const lines = useMemo(() => ((po?.lines as Array<Record<string, unknown>>) || []), [po]);
  const fulfillment = po ? poFulfillmentStatus(po, lines) : "Open";
  const supplier = (po?.supplier as Record<string, unknown> | undefined) || null;
  const supplierEmail = supplier ? String(supplier.contact_email || supplier.invoice_email || "") : "";
  const subtotal = Number(po?.subtotal || lines.reduce((sum, line) => sum + (Number(line.line_total || 0) - Number(line.vat_amount || 0)), 0));
  const vatAmount = Number(po?.vat_amount || lines.reduce((sum, line) => sum + Number(line.vat_amount || 0), 0));

  if (!po) {
    return <p className="text-sm font-bold text-slate-500">{message || "Loading…"}</p>;
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-violet-800 via-indigo-950 to-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(81,63,190,0.28)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#CBD5E1]">Premium Procurement Detail</div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] md:text-5xl">Purchase Order Intelligence</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-violet-100">Track financial exposure, fulfilment status, linked GRNs, supplier invoices and approval history from one board-ready purchase order view.</p>
            <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">PO Value</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Fulfilment</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">GRNs</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Invoice Match</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Variance</span>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">VYRON COST principle</div>
              <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;PO, GRN and invoice must agree — variance is either margin or risk.&rdquo;</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#CBD5E1]">Business intelligence</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">Every action on this page should improve cost visibility, margin control and financial trust.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/purchase-orders/list" className="text-xs font-black text-violet-700">
            ← PO List
          </Link>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{String(po.po_number)}</h1>
          <p className="text-sm font-semibold text-slate-500">
            {String(po.supplier_name_snapshot)} · {String(po.status)} · {fulfillment}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link href={`/purchase-orders/${poId}/edit`} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">
              Edit PO
            </Link>
          ) : null}
          <DocumentPdfActions
            pdfUrl={`/api/purchase-orders/${poId}/pdf${poApiWorkspaceContext().query}`}
            emailUrl={`/api/purchase-orders/${poId}/email${poApiWorkspaceContext().query}`}
            fileName={`${String(po.po_number || "purchase-order")}.pdf`}
            defaultRecipient={supplierEmail}
          />
          {canReceiveGoods ? (
            <Link href={`/goods-receipts/new?po=${poId}`} className="rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-black text-white">
              Receive Goods
            </Link>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={requestDeletePo} className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-800">
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className="rounded-xl bg-fuchsia-50 px-4 py-2 text-xs font-bold text-fuchsia-800 print:hidden">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Subtotal</div>
          <div className="text-2xl font-black">{formatMoney(subtotal)}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">VAT</div>
          <div className="text-2xl font-black">{formatMoney(vatAmount)}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">PO Total</div>
          <div className="text-2xl font-black">{formatMoney(Number(po.total || 0))}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Invoice Total</div>
          <div className="text-2xl font-black">{formatMoney(Number(po.invoice_total || 0))}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Variance</div>
          <div className="text-2xl font-black text-red-600">{formatMoney(Number(po.variance || 0))}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Fulfillment</div>
          <div className="text-lg font-black text-violet-800">{fulfillment}</div>
          <div className="text-xs font-semibold text-slate-500">Match: {String(po.match_status || "—")}</div>
        </div>
      </div>

      <div className="print:hidden flex flex-wrap gap-2">
        {["Submitted", "Approved", "Sent", "Closed"]
          .filter((s) => canSetStatus(s))
          .map((s) => (
            <button
              key={s}
              type="button"
              disabled={pendingStatus === s}
              onClick={() => void setStatus(s)}
              className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-60"
            >
              Mark {s}
            </button>
          ))}
      </div>

      <div className="rounded-2xl border border-violet-100 bg-white p-4 text-sm font-semibold text-slate-700 print:hidden">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">Supplier Details</div>
        <div className="mt-1">{String(po.supplier_name_snapshot || "—")}</div>
        <div className="text-slate-500">{supplierEmail || "No supplier email on file."}</div>
        <div className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-violet-700">Notes</div>
        <div className="mt-1 whitespace-pre-wrap text-slate-600">{String(po.notes || "No notes")}</div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-[2rem] border border-violet-100 bg-white">
        <table className="min-w-[880px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">VAT %</th>
              <th className="px-4 py-3">VAT Amt</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={String(line.id)} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">{String(line.item_name)}</td>
                <td className="px-4 py-3">{String(line.item_type)}</td>
                <td className="px-4 py-3">{Number(line.quantity)}</td>
                <td className="px-4 py-3">{String(line.unit)}</td>
                <td className="px-4 py-3">R{Number(line.unit_price).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(line.vat_rate || 0).toFixed(2)}</td>
                <td className="px-4 py-3">R{Number(line.vat_amount || 0).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(line.received_qty)}</td>
                <td className="px-4 py-3">{Number(line.outstanding_qty)}</td>
                <td className="px-4 py-3 font-black">R{Number(line.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <div className="rounded-[2rem] border border-violet-100 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Linked goods receipts</h2>
          <div className="mt-3 space-y-2">
            {goodsReceipts.length ? (
              goodsReceipts.map((grn) => (
                <Link
                  key={String(grn.id)}
                  href={`/goods-receipts/${grn.id}`}
                  className="block rounded-xl border border-slate-100 px-4 py-3 text-sm hover:bg-violet-50"
                >
                  <div className="font-black text-violet-700">{String(grn.grn_number || grn.id)}</div>
                  <div className="text-xs text-slate-500">
                    {String(grn.receipt_type || "receipt")} · {String(grn.received_at || "").slice(0, 16)}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-slate-500">No GRNs posted yet.</p>
            )}
          </div>
        </div>
        <div className="rounded-[2rem] border border-violet-100 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Linked supplier invoices</h2>
          <div className="mt-3 space-y-2">
            {linkedInvoices.length ? (
              linkedInvoices.map((doc) => (
                <Link
                  key={String(doc.id)}
                  href={`/document-intelligence/${doc.id}`}
                  className="block rounded-xl border border-slate-100 px-4 py-3 text-sm hover:bg-violet-50"
                >
                  <div className="font-black text-violet-700">{String(doc.invoice_number || doc.id)}</div>
                  <div className="text-xs text-slate-500">
                    {String(doc.status || "review")} · {formatMoney(Number(doc.total || 0))}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-slate-500">No invoices linked yet.</p>
            )}
          </div>
        </div>
      </div>

      {po.approved_by ? (
        <p className="text-xs font-semibold text-slate-500">
          Approved by {String(po.approved_by)} · {String(po.approved_at || "").slice(0, 16)} · {String(po.approval_notes || "")}
        </p>
      ) : null}
    </section>
      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </>
  );
}
