"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronPremiumHeroBanner, VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";

type PoRow = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  total: number;
  expected_total: number;
  invoice_total: number;
  variance: number;
  order_date: string | null;
};

export default function ProcurementPoListClient({ initialStatus = "" }: { initialStatus?: string }) {
  const { canCreate } = useModulePermissions("purchase_orders");
  const { canCreate: canReceiveGoods } = useModulePermissions("goods_receipts");
  const [orders, setOrders] = useState<PoRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus || "All");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { query: workspaceQuery } = poApiWorkspaceContext();
    const params = new URLSearchParams(workspaceQuery ? workspaceQuery.slice(1) : "");
    if (status !== "All") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/purchase-orders?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setOrders(data.orders || []);
    setLoading(false);
  }, [search, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => orders, [orders]);

  function exportCsv() {
    const header = ["PO", "Supplier", "Status", "Total", "Invoice", "Variance", "Order Date"];
    const rows = filtered.map((po) => [po.po_number, po.supplier_name_snapshot || "", po.status, String(po.total || po.expected_total || 0), String(po.invoice_total || 0), String(po.variance || 0), po.order_date || ""]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-purchase-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="procurement"
        badge="Premium PO Workspace"
        title="Purchase Orders"
        subtitle="Search, filter and manage all purchase orders — from draft through receipt and closure."
        quotes={[
          {
            label: "Search discipline",
            quote: "Find the PO before you receive against it — wrong PO, wrong stock.",
          },
        ]}
      >
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm"
        >
          <Download size={16} /> Export CSV
        </button>
        {canCreate ? (
          <Link href="/purchase-orders/new" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-900 shadow-lg">
            New PO
          </Link>
        ) : null}
      </VyronPremiumHeroBanner>

      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
      <VyronPremiumSectionHeading
        eyebrow="Filter"
        title="All purchase orders"
        subtitle="Search by PO number or supplier, then narrow by status."
      />
      <div className="mb-4 mt-5 flex flex-wrap gap-2">
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
          placeholder="Search PO or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["All", "Draft", "Submitted", "Approved", "Sent", "Partially Received", "Fully Received", "Closed", "Cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
        <button type="button" onClick={() => void refresh()} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black">
          Refresh
        </button>
      </div>
      {loading ? (
        <p className="text-sm font-bold text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="py-2">PO</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Total</th>
                <th>Invoice</th>
                <th>Variance</th>
                <th>Receive</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((po) => (
                <tr key={po.id} className="border-t">
                  <td className="py-3 font-black">{po.po_number}</td>
                  <td>{po.supplier_name_snapshot || "—"}</td>
                  <td className="font-bold text-violet-700">{po.status}</td>
                  <td>{formatMoney(Number(po.total || po.expected_total || 0))}</td>
                  <td>{formatMoney(Number(po.invoice_total || 0))}</td>
                  <td className={Number(po.variance) !== 0 ? "font-bold text-red-600" : ""}>
                    {formatMoney(Number(po.variance || 0))}
                  </td>
                  <td>
                    {canReceiveGoods ? (
                      <Link href={`/goods-receipts/new?po=${po.id}`} className="rounded-full bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-700">
                        Receive Goods
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">—</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/purchase-orders/${po.id}`} className="text-xs font-black text-violet-700 hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </section>
  );
}
