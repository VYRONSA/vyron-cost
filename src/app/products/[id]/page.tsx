import Link from "next/link";
import ProductBomLinkClient from "@/components/ProductBomLinkClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { calcGp, calcSuggestedPrice, formatMoney, getProductById } from "@/lib/vyron-cost-product-data";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { product, bom, boms } = await getProductById(id);

  if (!product) {
    return (
      <VyronCostAiShell hidePageHeader title="Product Not Found" subtitle="This product could not be loaded.">
        <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600">Product not found.</div>
      </VyronCostAiShell>
    );
  }

  const cost = Number(product.total_cost || bom?.cost_per_unit || 0);
  const price = Number(product.selling_price || 0);
  const targetGp = Number(product.target_gp || 40);
  const actualGp = Number(product.calculated_gp || calcGp(price, cost));
  const suggestedPrice = Number(product.suggested_selling_price || calcSuggestedPrice(cost, targetGp));

  return (
    <VyronCostAiShell hidePageHeader title={product.product_name} subtitle="Product detail, linked BOM, cost, selling price and margin status.">
      <section className="grid gap-5 md:grid-cols-5">
        {[
          ["BOM Cost", formatMoney(cost), "text-slate-900"],
          ["Selling Price", formatMoney(price), "text-slate-900"],
          ["Actual GP", `${actualGp.toFixed(1)}%`, actualGp < targetGp ? "text-red-600" : "text-[#84CC16]"],
          ["Target GP", `${targetGp.toFixed(1)}%`, "text-violet-700"],
          ["Suggested", formatMoney(suggestedPrice), "text-[#84CC16]"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`mt-3 text-3xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Linked BOM</h2>
          {bom ? (
            <div className="mt-5 rounded-3xl bg-violet-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">BOM / Recipe</div>
              <div className="mt-2 text-2xl font-black text-violet-950">{bom.bom_name}</div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/recipes/${bom.id}`} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-700">Open BOM</Link>
                <Link href={`/recipes/${bom.id}/edit`} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">Edit BOM</Link>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-red-50 p-5 text-sm font-bold leading-7 text-red-700">No BOM is linked to this product yet.</div>
          )}

          <ProductBomLinkClient productId={product.id} currentBomId={product.linked_bom_id} sellingPrice={price} targetGp={targetGp} boms={boms} />
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Calculation</h2>
          <div className="mt-5 space-y-4 text-sm font-semibold leading-7 text-slate-600">
            <p><b>Product Cost</b> comes from the linked BOM cost per unit.</p>
            <p><b>Actual GP%</b> = (Selling Price - Product Cost) ÷ Selling Price.</p>
            <p><b>Suggested Price</b> = Product Cost ÷ (1 - Target GP%).</p>
          </div>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
