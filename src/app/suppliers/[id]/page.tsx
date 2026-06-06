import Link from "next/link";
import SupplierAiRecommendations from "@/components/SupplierAiRecommendations";
import SupplierProcurementStats from "@/components/SupplierProcurementStats";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { formatMoney, getIngredients, getSupplierById } from "@/lib/vyron-cost-core-data";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, ingredients] = await Promise.all([getSupplierById(id), getIngredients()]);
  const linked = ingredients.filter((i) => i.supplier_id === id || id.startsWith("demo"));
  if (!supplier) return <VyronCostAiShell title="Supplier Not Found"><div className="rounded-[2rem] bg-white p-8">Supplier not found.</div></VyronCostAiShell>;
  return (
    <VyronCostAiShell title={supplier.supplier_name} subtitle="Supplier detail, price movement and linked ingredients.">
      <Link
        href={`/supplier-intelligence/${id}`}
        className="mb-5 inline-flex rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700"
      >
        Open Supplier Intelligence Profile →
      </Link>
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Category</div><div className="mt-3 text-3xl font-black">{supplier.category}</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Risk</div><div className="mt-3 text-3xl font-black text-violet-700">{supplier.risk_status}</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Movement</div><div className="mt-3 text-3xl font-black text-red-600">{Number(supplier.last_price_movement || 0).toFixed(1)}%</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Ingredients</div><div className="mt-3 text-3xl font-black">{linked.length}</div></div>
      </section>
      <SupplierProcurementStats supplierId={id} />
      <SupplierAiRecommendations supplierId={id} supplierName={supplier.supplier_name} />
      <section className="mt-5 rounded-[2rem] bg-white p-6">
        <h2 className="text-2xl font-black">Linked Ingredients</h2>
        <div className="mt-5 grid gap-3">
          {linked.map((i) => <div key={i.id} className="rounded-2xl bg-slate-50 p-4 font-bold">{i.ingredient_name} — {formatMoney(i.purchase_cost)}</div>)}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
