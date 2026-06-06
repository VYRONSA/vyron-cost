"use client";

import Link from "next/link";
import { Download, Printer, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function BackOrdersClient() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/back-orders")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.backOrders || []);
        else setMessage(d.error || "Could not load back orders.");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load back orders."));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [rows, search]);

  function exportCsv() {
    const header = ["Supplier", "PO", "Item", "Outstanding", "Unit", "Expected", "Status"];
    const body = filtered.map((row) => [
      row.supplier_name_snapshot || row.supplier_name || "",
      row.po_number || row.purchase_order_number || row.purchase_order_id || "",
      row.item_name || "",
      num(row.outstanding_qty),
      row.unit || "",
      row.expected_date || "",
      row.status || "",
    ]);
    const csv = [header, ...body].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-back-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/purchase-orders" className="rounded-2xl border border-violet-100 bg-white px-4 py-2 text-sm font-black text-violet-700">
          ← Back
        </Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800"><Printer size={14} /> Print</button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800"><Download size={14} /> Export CSV</button>
          <Link href="/goods-receipts/new" className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white">Receive Goods</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Open Lines</div><div className="text-2xl font-black">{filtered.length}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Outstanding Qty</div><div className="text-2xl font-black">{filtered.reduce((s, r) => s + num(r.outstanding_qty), 0).toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Suppliers</div><div className="text-2xl font-black">{new Set(filtered.map((r) => String(r.supplier_name_snapshot || r.supplier_name || ""))).size}</div></div>
      </div>

      <div className="rounded-[2rem] border border-violet-100 bg-white p-4 print:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <Search size={18} className="text-violet-700" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier, PO or item…" className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{filtered.length}</span>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">{message}</p> : null}

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">PO</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 print:hidden">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center font-bold text-slate-500">No open back orders.</td></tr> : null}
            {filtered.map((row, index) => {
              const poId = String(row.purchase_order_id || "");
              const poNumber = String(row.po_number || row.purchase_order_number || poId || "—");
              return (
                <tr key={String(row.id || index)} className="border-t border-slate-100 hover:bg-violet-50/50">
                  <td className="px-4 py-3 font-bold text-slate-900">{String(row.supplier_name_snapshot || row.supplier_name || "—")}</td>
                  <td className="px-4 py-3 font-black text-violet-700">{poNumber}</td>
                  <td className="px-4 py-3 font-bold">{String(row.item_name || "—")}</td>
                  <td className="px-4 py-3 font-black text-red-600">{num(row.outstanding_qty).toFixed(2)} {String(row.unit || "")}</td>
                  <td className="px-4 py-3">{String(row.expected_date || "—")}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase text-amber-800">{String(row.status || "Open")}</span></td>
                  <td className="px-4 py-3 print:hidden">
                    <div className="flex flex-wrap gap-2">
                      {poId ? <Link href={`/purchase-orders/${poId}`} className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open PO</Link> : null}
                      {poId ? <Link href={`/goods-receipts/new?po=${poId}`} className="rounded-full bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-700">Receive Balance</Link> : null}
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
