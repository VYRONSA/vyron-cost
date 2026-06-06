"use client";

import Link from "next/link";
import { Mail, Printer, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ReceiptRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "");
}

export default function GoodsReceiptDashboardClient() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  async function loadReceipts() {
    setMessage("");
    try {
      const res = await fetch("/api/goods-receipts");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not load goods receipts.");
      setReceipts(data.receipts || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load goods receipts.");
    }
  }

  useEffect(() => {
    void loadReceipts();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return receipts.slice(0, 12);
    return receipts
      .filter((row) =>
        [
          row.grn_number,
          row.po_number,
          row.supplier_name_snapshot,
          row.receipt_type,
          row.status,
          row.received_by,
          row.notes,
        ]
          .map(text)
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 25);
  }, [receipts, search]);

  function emailSummary() {
    const subject = encodeURIComponent("VYRON COST GRN summary");
    const body = encodeURIComponent(
      filtered
        .map((row) => `${text(row.grn_number || row.id)} · ${text(row.supplier_name_snapshot)} · ${text(row.receipt_type)} · ${text(row.received_at).slice(0, 10)}`)
        .join("\n") || "No GRNs found."
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] print:hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Goods Received Notes</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Receive goods from a PO, review linked GRNs, print, email and open back orders.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/goods-receipts/new" className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white">
              New GRN
            </Link>
            <Link href="/goods-receipts/history" className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">
              GRN History
            </Link>
            <Link href="/purchase-orders/back-orders" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-900">
              Back Orders
            </Link>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-5 py-3 text-sm font-black text-violet-800">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={emailSummary} className="inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-5 py-3 text-sm font-black text-violet-800">
              <Mail size={16} /> Email
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <Search size={18} className="text-violet-700" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search GRN number, supplier, PO, receiver or status…"
            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
          />
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{filtered.length} shown</span>
        </div>
      </div>

      {message ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">{message}</p> : null}

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr>
              <th className="px-4 py-3">GRN</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Source PO</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-bold text-slate-500">
                  No goods receipts found. Use New GRN to receive from a purchase order.
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const id = text(row.id);
              const poId = text(row.purchase_order_id);
              return (
                <tr key={id} className="border-t border-slate-100 hover:bg-violet-50/50">
                  <td className="px-4 py-3 font-black text-violet-700">
                    <Link href={`/goods-receipts/${id}`}>{text(row.grn_number || id)}</Link>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-700">{text(row.supplier_name_snapshot || "Supplier")}</td>
                  <td className="px-4 py-3">
                    {poId ? <Link href={`/purchase-orders/${poId}`} className="font-black text-violet-700">Open PO</Link> : "—"}
                  </td>
                  <td className="px-4 py-3">{text(row.receipt_type || "receipt")}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{text(row.status || "Posted")}</td>
                  <td className="px-4 py-3">{text(row.received_at).slice(0, 16) || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/goods-receipts/${id}`} className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open →</Link>
                      {poId ? <Link href={`/goods-receipts/new?po=${poId}`} className="rounded-full bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-700">Receive balance</Link> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
