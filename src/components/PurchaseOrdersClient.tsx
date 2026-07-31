"use client";

import { CheckCircle2, Edit3, Plus, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import {
  deletePurchaseOrder,
  PurchaseOrderDetail,
} from "@/lib/vyron-purchase-order-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const statusOptions = ["All", "Draft", "Review", "Approved", "Matched", "Invoice Variance", "Received"];

export default function PurchaseOrdersClient({
  initialOrders,
  companyId,
}: {
  initialOrders: PurchaseOrderDetail[];
  companyId: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrderDetail | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((po) => {
      const matchesSearch =
        !term ||
        [po.po_number, po.supplier_name_snapshot || "", po.status, String(po.expected_total)]
          .join(" ")
          .toLowerCase()
          .includes(term);
      const matchesStatus = statusFilter === "All" || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  async function updateStatus(id: string, status: string) {
    setOrders((current) => current.map((po) => (po.id === id ? { ...po, status } : po)));
    if (supabase && companyId !== "demo-company" && !id.startsWith("demo-")) {
      await supabase.from("vyron_cost_purchase_orders").update({ status }).eq("id", id);
    }
    setMessage(`PO updated to ${status}.`);
  }

  async function removeOrder(id: string) {
    setDeleting(true);
    try {
      setOrders((current) => current.filter((po) => po.id !== id));
      await deletePurchaseOrder(id);
      setMessage("Purchase order deleted.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const openCount = orders.filter((po) => /review|draft/i.test(po.status)).length;
  const varianceTotal = orders.reduce((sum, po) => sum + Number(po.variance || 0), 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Purchase Orders",
        subtitle: "Premium VYRON COST workflow for purchase orders.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <>
          <section className="grid gap-6">
            <div className="grid gap-5 md:grid-cols-4">
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Open POs</div>
                <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{openCount}</div>
              </div>
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Total PO Value</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">
                  {formatMoney(orders.reduce((sum, po) => sum + Number(po.expected_total || 0), 0))}
                </div>
              </div>
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Invoice Variance</div>
                <div className="mt-3 text-4xl font-black text-red-600">{formatMoney(varianceTotal)}</div>
              </div>
              <Link
                href="/purchase-orders/new"
                className="flex items-center justify-center gap-2 rounded-[2rem] bg-[#07110d] p-6 text-sm font-black text-[#A855F7] transition hover:bg-[#0d1a12]"
              >
                <Plus size={18} />
                Create New PO
              </Link>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">Purchase Order Register</h2>
                  <p className="mt-2 text-sm text-slate-500">Search, filter, approve and receive purchase orders.</p>
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
                >
                  {statusOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              <SearchFilterBar
                value={search}
                onChange={setSearch}
                placeholder="Search PO number, supplier, status..."
                resultCount={filtered.length}
              />

              <div className="overflow-x-auto rounded-3xl border border-slate-100">
                <div className="min-w-[1100px]">
                  <div className="grid grid-cols-8 bg-[#07111A] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#DDD6FE]">
                    <div>PO Number</div>
                    <div>Supplier</div>
                    <div>Status</div>
                    <div>Expected</div>
                    <div>Invoice</div>
                    <div>Variance</div>
                    <div>Actions</div>
                    <div>Delete</div>
                  </div>

                  {filtered.map((po) => (
                    <div key={po.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-4 text-sm">
                      <div>
                        <Link href={`/purchase-orders/${po.id}`} className="font-black text-[#F8FAFC] hover:text-[#7E22CE]">
                          {po.po_number}
                        </Link>
                      </div>
                      <div className="font-bold text-slate-600">{po.supplier_name_snapshot || "—"}</div>
                      <div>
                        <StatusPill tone={/variance|review/i.test(po.status) ? "amber" : /matched|approved|received/i.test(po.status) ? "emerald" : "slate"}>
                          {po.status}
                        </StatusPill>
                      </div>
                      <div>{formatMoney(Number(po.expected_total))}</div>
                      <div>{formatMoney(Number(po.invoice_total))}</div>
                      <div className={Number(po.variance) > 0 ? "font-black text-red-600" : "font-black text-slate-700"}>
                        {formatMoney(Number(po.variance || 0))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/purchase-orders/${po.id}`} className="inline-flex items-center gap-1 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE]">
                          <Edit3 size={14} />
                          Open
                        </Link>
                        <button type="button" onClick={() => updateStatus(po.id, "Approved")} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                          <CheckCircle2 size={14} />
                          Approve
                        </button>
                        <button type="button" onClick={() => updateStatus(po.id, "Received")} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                          <Truck size={14} />
                          Received
                        </button>
                      </div>
                      <div>
                        <button type="button" onClick={() => setDeleteTarget(po)} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {message ? <div className="mt-4 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#7E22CE]">{message}</div> : null}
            </div>
          </section>
          <ConfirmDeleteDialog
            open={!!deleteTarget}
            confirming={deleting}
            message={`Are you sure you want to delete ${deleteTarget?.po_number || "this purchase order"}? This action cannot be undone.`}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => deleteTarget ? void removeOrder(deleteTarget.id) : undefined}
          />
          </>
    </VyronPremiumPageShell>
  );
}
