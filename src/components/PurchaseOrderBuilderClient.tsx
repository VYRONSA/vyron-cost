"use client";
import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CostIngredient, CostSupplier } from "@/lib/vyron-cost-core-data";
import { calcLineExcl, calcLineTotal, calcLineVat, formatMoney } from "@/lib/vyron-cost-purchase-order-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type Line = { temp_id:string; ingredient_id:string; item_name:string; category:string; quantity:number; unit:string; unit_cost:number; vat_rate:number; };
function nl(): Line { return { temp_id: crypto.randomUUID(), ingredient_id:"", item_name:"", category:"Ingredient", quantity:0, unit:"kg", unit_cost:0, vat_rate:15 }; }

export default function PurchaseOrderBuilderClient({ suppliers, ingredients }: { suppliers: CostSupplier[]; ingredients: CostIngredient[] }) {
 const [poNumber,setPoNumber]=useState(`PO-${Date.now().toString().slice(-6)}`);
 const [supplierId,setSupplierId]=useState("");
 const [status,setStatus]=useState("Draft");
 const [lines,setLines]=useState<Line[]>([nl()]);
 const [msg,setMsg]=useState(""); const [err,setErr]=useState("");
 const supplier=suppliers.find(s=>s.id===supplierId);
 const totals=useMemo(()=>{const subtotal=lines.reduce((s,l)=>s+calcLineExcl(l.quantity,l.unit_cost),0); const vat=lines.reduce((s,l)=>s+calcLineVat(l.quantity,l.unit_cost,l.vat_rate),0); return {subtotal,vat,total:subtotal+vat}},[lines]);
 function selectIng(id:string, tid:string){const ing=ingredients.find(i=>i.id===id); setLines(c=>c.map(l=>l.temp_id===tid?{...l,ingredient_id:id,item_name:ing?.ingredient_name||"",category:ing?.category||"Ingredient",unit:ing?.purchase_unit||"kg",unit_cost:Number(ing?.purchase_cost||0)}:l))}
 function update(tid:string, field:keyof Line, val:any){setLines(c=>c.map(l=>l.temp_id===tid?{...l,[field]:val}:l))}
 async function save(){setMsg("");setErr(""); if(!supplierId) return setErr("Supplier required."); if(!supabase) return setErr("Supabase not configured.");
 const {data,error}=await supabase.from("vyron_cost_purchase_orders").insert({po_number:poNumber,supplier_id:supplierId,supplier_name:supplier?.supplier_name,status,subtotal:totals.subtotal,vat:totals.vat,total:totals.total}).select("id").single(); if(error)return setErr(error.message);
 const rows=lines.filter(l=>l.item_name&&l.quantity>0).map((l,i)=>({purchase_order_id:data.id,ingredient_id:l.ingredient_id||null,item_name:l.item_name,category:l.category,quantity:l.quantity,unit:l.unit,unit_cost:l.unit_cost,vat_rate:l.vat_rate,sort_order:i}));
 const le=await supabase.from("vyron_cost_purchase_order_lines").insert(rows); if(le.error)return setErr(le.error.message); setMsg("Purchase order saved.");}
 return (
    <VyronPremiumPageShell
      config={{
        title: "Purchase Order Builder",
        subtitle: "Premium VYRON COST workflow for purchase order builder.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6"><div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]"><div className="grid gap-4 md:grid-cols-3"><input value={poNumber} onChange={e=>setPoNumber(e.target.value)} className="rounded-2xl border px-4 py-3 font-bold"/><select value={supplierId} onChange={e=>setSupplierId(e.target.value)} className="rounded-2xl border px-4 py-3 font-bold"><option value="">Supplier...</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-2xl border px-4 py-3 font-bold"><option>Draft</option><option>Submitted</option><option>Approved</option><option>Received</option></select></div></div>
       <div className="grid gap-5 md:grid-cols-3"><div className="rounded-[2rem] bg-white p-5"><b>Subtotal</b><div className="text-3xl font-black">{formatMoney(totals.subtotal)}</div></div><div className="rounded-[2rem] bg-white p-5"><b>VAT</b><div className="text-3xl font-black">{formatMoney(totals.vat)}</div></div><div className="rounded-[2rem] bg-[#A3E635]/10 p-5"><b>Total</b><div className="text-3xl font-black text-[#84CC16]">{formatMoney(totals.total)}</div></div></div>
       {msg&&<div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-4 font-bold text-[#65A30D]">{msg}</div>}{err&&<div className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">{err}</div>}
       <div className="rounded-[2rem] bg-white p-5"><button onClick={()=>setLines(c=>[...c,nl()])} className="mb-4 rounded-xl bg-violet-50 px-4 py-2 font-black text-violet-700 flex gap-2"><Plus size={16}/>Add Line</button><div className="overflow-x-auto"><div className="min-w-[900px]">{lines.map(l=><div key={l.temp_id} className="grid grid-cols-[260px_90px_90px_90px_120px_55px] gap-2 border-t py-2"><select value={l.ingredient_id} onChange={e=>selectIng(e.target.value,l.temp_id)} className="rounded-xl border px-2 py-2"><option value="">Ingredient...</option>{ingredients.map(i=><option key={i.id} value={i.id}>{i.ingredient_name}</option>)}</select><input type="number" value={l.quantity} onChange={e=>update(l.temp_id,"quantity",Number(e.target.value))} className="rounded-xl border px-2"/><input value={l.unit} onChange={e=>update(l.temp_id,"unit",e.target.value)} className="rounded-xl border px-2"/><input type="number" value={l.unit_cost} onChange={e=>update(l.temp_id,"unit_cost",Number(e.target.value))} className="rounded-xl border px-2"/><div className="font-black text-right">{formatMoney(calcLineTotal(l.quantity,l.unit_cost,l.vat_rate))}</div><button onClick={()=>setLines(c=>c.filter(x=>x.temp_id!==l.temp_id))} className="rounded-xl bg-red-50 text-red-700 flex items-center justify-center"><Trash2 size={16}/></button></div>)}</div></div><button onClick={save} className="mt-5 rounded-2xl bg-violet-700 px-6 py-4 font-black text-white flex gap-2"><Save size={18}/>Save PO</button></div></section>
    </VyronPremiumPageShell>
  );
}
