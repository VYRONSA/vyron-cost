"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import {
  PO_ENGINE_STATUSES,
  type PurchaseOrderEngineRow,
} from "@/lib/vyron-purchase-order-engine";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusClass(status: string) {
  if (status === "Received" || status === "Fully Received") return "bg-slate-100 text-slate-700";
  if (status === "Partially Received") return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  if (status === "Sent" || status === "Approved") return "bg-blue-100 text-blue-800";
  if (status === "Cancelled") return "bg-rose-100 text-rose-800";
  return "bg-violet-100 text-violet-800";
}

export default function PurchaseOrdersEngineClient() {
  const [orders, setOrders] = useState<PurchaseOrderEngineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/purchase-orders/engine?${params.toString()}`);
      const data = await response.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as PurchaseOrderEngineRow[]);
        return;
      }
      setOrders([]);
      setError(data.error || "Could not load purchase orders.");
    } catch {
      setOrders([]);
      setError("Could not load purchase orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((row) =>
      [row.po_number, row.supplier_name, row.display_status].join(" ").toLowerCase().includes(term)
    );
  }, [orders, search]);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Purchase Order Engine",
        title: "Purchase Orders",
        subtitle: "Convert requisitions into supplier-grouped POs and receive stock into inventory.",
        outcomes: [
          "One PO per supplier from approved requisitions",
          "Receive full or partial against open lines",
          "Inventory receipts posted automatically",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/purchase-orders/new" className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white">
            Create Purchase Order
          </Link>
          <Link href="/procurement" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Procurement Requisitions
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {["All", ...PO_ENGINE_STATUSES].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    statusFilter === status ? "bg-[#1D6BFF] text-white" : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="relative min-w-[220px] flex-1 md:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadOrders()}
                placeholder="Search PO or supplier…"
                className="w-full rounded-xl border border-[#E2E8F0] py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm font-semibold text-[#64748B]">Loading purchase orders…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-10 text-center">
              <ShoppingCart className="mx-auto mb-3 text-[#94A3B8]" size={28} />
              <p className="text-sm font-semibold text-[#64748B]">No purchase orders yet.</p>
              <p className="mt-1 text-xs text-[#94A3B8]">Generate POs from an approved procurement requisition.</p>
            </div>
          ) : (
            <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
              <table className="min-w-full">
                <thead className={VYRON_TABLE.head}>
                  <tr>
                    <th className="px-4 py-3 text-left">PO Number</th>
                    <th className="px-4 py-3 text-left">Supplier</th>
                    <th className="px-4 py-3 text-left">Order Date</th>
                    <th className="px-4 py-3 text-left">Expected Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className={VYRON_TABLE.row}>
                      <td className="px-4 py-3">
                        <Link href={`/purchase-orders/${row.id}`} className="font-bold text-[#1D6BFF] hover:underline">
                          {row.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold">{row.supplier_name}</td>
                      <td className="px-4 py-3 text-sm">{row.order_date || "—"}</td>
                      <td className="px-4 py-3 text-sm">{row.expected_date || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass(row.display_status)}`}>
                          {row.display_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatMoney(row.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnterpriseScrollContainer>
          )}
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
