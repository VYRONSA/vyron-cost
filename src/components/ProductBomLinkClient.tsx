"use client";

import { Link2, Save } from "lucide-react";
import { useState } from "react";
import { BomHeader } from "@/lib/vyron-cost-bom-data";
import { calcGp, calcSuggestedPrice, formatMoney } from "@/lib/vyron-cost-product-data";
import { supabase } from "@/lib/supabase";

export default function ProductBomLinkClient({
  productId,
  currentBomId,
  sellingPrice,
  targetGp,
  boms,
}: {
  productId: string;
  currentBomId?: string | null;
  sellingPrice: number;
  targetGp: number;
  boms: BomHeader[];
}) {
  const [bomId, setBomId] = useState(currentBomId || "");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const bom = boms.find((item) => item.id === bomId) || null;
  const cost = Number(bom?.cost_per_unit || 0);
  const gp = calcGp(sellingPrice, cost);
  const suggested = calcSuggestedPrice(cost, targetGp);

  async function save() {
    setMessage("");
    setErrorMessage("");

    if (!bomId) {
      setErrorMessage("Choose a BOM first.");
      return;
    }
    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    const { error } = await supabase
      .from("vyron_cost_products")
      .update({
        linked_bom_id: bomId,
        total_cost: cost,
        calculated_gp: gp,
        suggested_selling_price: suggested,
      })
      .eq("id", productId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("BOM linked successfully. Refresh product to see updated values.");
  }

  return (
    <div className="mt-5 rounded-3xl bg-violet-50 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
          <Link2 size={20} />
        </div>
        <div>
          <div className="font-black text-violet-950">Link BOM to this product</div>
          <p className="mt-1 text-sm font-bold leading-6 text-violet-900">Choose a BOM and product cost/GP will update.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_180px]">
        <select value={bomId} onChange={(e) => setBomId(e.target.value)} className="rounded-2xl border border-violet-200 bg-white px-4 py-4 text-sm font-bold outline-none">
          <option value="">Choose BOM...</option>
          {boms.map((item) => <option key={item.id} value={item.id}>{item.bom_name} — {formatMoney(item.cost_per_unit)}</option>)}
        </select>
        <button onClick={save} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-4 text-sm font-black text-white"><Save size={17} /> Save Link</button>
      </div>

      {bom && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Cost</div><div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(cost)}</div></div>
          <div className="rounded-2xl bg-white p-4"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">GP</div><div className={`mt-1 text-2xl font-black ${gp < targetGp ? "text-red-600" : "text-emerald-600"}`}>{gp.toFixed(1)}%</div></div>
          <div className="rounded-2xl bg-white p-4"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Suggested</div><div className="mt-1 text-2xl font-black text-emerald-600">{formatMoney(suggested)}</div></div>
        </div>
      )}

      {message && <div className="mt-4 rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {errorMessage && <div className="mt-4 rounded-2xl bg-red-100 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
    </div>
  );
}
