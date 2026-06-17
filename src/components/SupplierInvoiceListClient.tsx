"use client";
import { Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SupplierInvoice, formatMoney } from "@/lib/vyron-cost-invoice-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function SupplierInvoiceListClient({ initialInvoices }: { initialInvoices: SupplierInvoice[] }) {
 const [items,setItems]=useState(initialInvoices); const [search,setSearch]=useState("");
 const filtered=useMemo(()=>items.filter(i=>[i.invoice_number,i.supplier_name||"",i.status||""].join(" ").toLowerCase().includes(search.toLowerCase())),[items,search]);
 async function remove(id:string){setItems(c=>c.filter(x=>x.id!==id)); if(supabase&&!id.startsWith("demo")) await supabase.from("vyron_cost_supplier_invoices").delete().eq("id",id);}
 return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Invoice List",
        subtitle: "Premium VYRON COST workflow for supplier invoice list.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6"><div className="rounded-[2rem] bg-white p-6 flex justify-between shadow-[0_18px_50px_rgba(81,63,190,0.08)]"><h2 className="text-2xl font-black">Invoice Intelligence</h2><div className="flex gap-3"><div className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="bg-transparent outline-none font-bold"/></div><Link href="/document-intelligence/new" className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white flex gap-2"><Plus size={18}/>Capture</Link></div></div><div className="rounded-[2rem] bg-white overflow-hidden"><div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase"><div>Invoice</div><div>Supplier</div><div>Date</div><div>Status</div><div>Duplicate</div><div>Total</div><div>Actions</div></div>{filtered.map(i=><div key={i.id} className="grid grid-cols-7 border-t px-5 py-4 text-sm"><Link href={`/document-intelligence/${i.id}`} className="font-black text-violet-700">{i.invoice_number}</Link><div>{i.supplier_name}</div><div>{i.invoice_date}</div><div>{i.status}</div><div className={i.duplicate_risk?"font-black text-red-600":"font-black text-[#84CC16]"}>{i.duplicate_risk?"Risk":"Clear"}</div><div className="font-black">{formatMoney(i.total)}</div><div className="flex gap-2"><Link href={`/document-intelligence/${i.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link><button onClick={()=>remove(i.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16}/></button></div></div>)}</div></section>
    </VyronPremiumPageShell>
  );
}
