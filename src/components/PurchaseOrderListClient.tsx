"use client";
import { Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { PurchaseOrder, formatMoney } from "@/lib/vyron-cost-purchase-order-data";
import { supabase } from "@/lib/supabase";

export default function PurchaseOrderListClient({ initialOrders }: { initialOrders: PurchaseOrder[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const filtered = useMemo(() => orders.filter((po) => [po.po_number, po.supplier_name || "", po.status || ""].join(" ").toLowerCase().includes(search.toLowerCase())), [orders, search]);
  async function remove(id: string) {
    setDeleting(true);
    try {
      setOrders((c) => c.filter((x) => x.id !== id));
      if (supabase && !id.startsWith("demo")) await supabase.from("vyron_cost_purchase_orders").delete().eq("id", id);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }
  return (
    <>
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-black">Purchase Orders</h2>
        <div className="flex gap-3"><div className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3"><Search size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search..." className="bg-transparent outline-none font-bold"/></div><Link href="/purchase-orders/new" className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white flex gap-2"><Plus size={18}/> New PO</Link></div>
      </div>
      <div className="rounded-[2rem] bg-white overflow-hidden shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase text-slate-500"><div>PO</div><div>Supplier</div><div>Branch</div><div>Date</div><div>Status</div><div>Total</div><div>Actions</div></div>
        {filtered.map((po)=><div key={po.id} className="grid grid-cols-7 border-t px-5 py-4 text-sm items-center"><Link className="font-black text-violet-700" href={`/purchase-orders/${po.id}`}>{po.po_number}</Link><div>{po.supplier_name}</div><div>{po.branch_name}</div><div>{po.po_date}</div><div className="font-black text-violet-700">{po.status}</div><div className="font-black">{formatMoney(po.total)}</div><div className="flex gap-2"><Link href={`/purchase-orders/${po.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link><button onClick={()=>setDeleteTarget(po)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16}/></button></div></div>)}
      </div>
    </section>
    <ConfirmDeleteDialog
      open={!!deleteTarget}
      confirming={deleting}
      message={`Are you sure you want to delete ${deleteTarget?.po_number || "this purchase order"}? This action cannot be undone.`}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => deleteTarget ? void remove(deleteTarget.id) : undefined}
    />
    </>
  )
}
