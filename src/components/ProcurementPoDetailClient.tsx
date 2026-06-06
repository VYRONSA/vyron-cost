"use client";

import Link from "next/link";
import { Mail, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

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
  const [po, setPo] = useState<Record<string, unknown> | null>(null);
  const [goodsReceipts, setGoodsReceipts] = useState<Array<Record<string, unknown>>>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${poId}`);
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

  async function setStatus(status: string) {
    setPendingStatus(status);
    const res = await fetch(`/api/purchase-orders/${poId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approvedBy: "supervisor", approvalNotes: `Status → ${status}` }),
    });
    const data = await res.json();
    setPendingStatus(null);
    if (data.ok) {
      setMessage(`PO updated to ${status}.`);
      await load();
    } else setMessage(data.error || "Update failed");
  }

  function printPo() {
    window.print();
  }

  function emailPo() {
    const poNumber = String(po?.po_number || "");
    const supplier = String(po?.supplier_name_snapshot || "");
    const total = formatMoney(Number(po?.total || 0));
    const subject = encodeURIComponent(`Purchase Order ${poNumber}`);
    const body = encodeURIComponent(
      `Please find purchase order ${poNumber} for ${supplier}.\nTotal: ${total}\n\nSent from VYRON COST.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  const lines = useMemo(() => ((po?.lines as Array<Record<string, unknown>>) || []), [po]);
  const fulfillment = po ? poFulfillmentStatus(po, lines) : "Open";

  if (!po) {
    return <p className="text-sm font-bold text-slate-500">{message || "Loading…"}</p>;
  }

  return (
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
          <Link href={`/purchase-orders/${poId}/edit`} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">
            Edit PO
          </Link>
          <button type="button" onClick={printPo} className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800">
            <Printer size={14} />
            Print
          </button>
          <button type="button" onClick={emailPo} className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800">
            <Mail size={14} />
            Email PO
          </button>
          <Link href={`/goods-receipts/new?po=${poId}`} className="rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-black text-white">
            Receive Goods
          </Link>
        </div>
      </div>

      {message ? <div className="rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 print:hidden">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        {["Submitted", "Approved", "Sent", "Closed"].map((s) => (
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

      <div className="min-w-0 overflow-x-auto rounded-[2rem] border border-violet-100 bg-white">
        <table className="min-w-[880px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Price</th>
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
  );
}
