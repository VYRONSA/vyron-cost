"use client";

import { Copy, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BomHeader, deleteBom, formatMoney } from "@/lib/vyron-cost-bom-data";
import { supabase } from "@/lib/supabase";

export default function BomListClient({ boms }: { boms: BomHeader[] }) {
  const [items, setItems] = useState(boms);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return items;
    return items.filter((bom) =>
      [bom.bom_name, bom.category || "", bom.status || ""].join(" ").toLowerCase().includes(term)
    );
  }, [items, search]);

  async function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    await deleteBom(id);
  }

  async function duplicate(bom: BomHeader) {
    if (!supabase || bom.id.startsWith("demo")) return;

    const { data: header, error } = await supabase
      .from("vyron_cost_boms")
      .insert({
        bom_name: `${bom.bom_name} Copy`,
        category: bom.category,
        yield_qty: bom.yield_qty,
        yield_unit: bom.yield_unit,
        target_gp: bom.target_gp,
        selling_price: bom.selling_price,
        total_cost: bom.total_cost,
        cost_per_unit: bom.cost_per_unit,
        calculated_gp: bom.calculated_gp,
        suggested_selling_price: bom.suggested_selling_price,
        status: "Draft",
        notes: bom.notes,
      })
      .select("*")
      .single();

    if (error || !header) return;

    const { data: lines } = await supabase.from("vyron_cost_bom_lines").select("*").eq("bom_id", bom.id);
    if (lines?.length) {
      await supabase.from("vyron_cost_bom_lines").insert(
        lines.map((line: any, index: number) => ({
          bom_id: header.id,
          line_type: line.line_type,
          ingredient_id: line.ingredient_id,
          line_name: line.line_name,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unit_cost,
          wastage_percent: line.wastage_percent,
          sort_order: index,
        }))
      );
    }

    setItems((current) => [...current, header as BomHeader].sort((a, b) => a.bom_name.localeCompare(b.bom_name)));
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Recipes & BOMs</h2>
            <p className="text-sm font-semibold text-slate-500">Create, open, duplicate and manage BOM costing structures.</p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <Search size={18} className="text-violet-700" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search BOMs..." className="w-72 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
            </div>
            <Link href="/recipes/new" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white">
              <Plus size={18} />
              New BOM
            </Link>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="min-w-[1040px]">
          <div className="grid grid-cols-[260px_170px_120px_130px_130px_100px_190px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <div>BOM</div><div>Category</div><div>Yield</div><div>Cost / Unit</div><div>Suggested</div><div>Status</div><div>Actions</div>
          </div>

          {filtered.map((bom) => (
            <div key={bom.id} className="grid grid-cols-[260px_170px_120px_130px_130px_100px_190px] items-center border-t border-slate-100 px-5 py-4 text-sm">
              <Link href={`/recipes/${bom.id}`} className="font-black text-violet-700">{bom.bom_name}</Link>
              <div className="font-bold text-slate-500">{bom.category || "Uncategorised"}</div>
              <div className="font-bold text-slate-500">{Number(bom.yield_qty || 0).toFixed(2)} {bom.yield_unit || ""}</div>
              <div className="font-black text-slate-900">{formatMoney(bom.cost_per_unit)}</div>
              <div className="font-black text-emerald-600">{formatMoney(bom.suggested_selling_price)}</div>
              <div className="font-black text-violet-700">{bom.status || "Draft"}</div>
              <div className="flex gap-2">
                <Link href={`/recipes/${bom.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link>
                <button onClick={() => duplicate(bom)} className="rounded-xl bg-slate-100 p-2 text-slate-700"><Copy size={16} /></button>
                <button onClick={() => remove(bom.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
