import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { detailHref } from "@/lib/vyron-entity-details";
import { SimpleRow } from "@/lib/vyron-cost-ui-adapters";

export default function VyronCostDataPage({
  title,
  subtitle,
  rows,
  type,
}: {
  title: string;
  subtitle: string;
  rows: SimpleRow[];
  type: "products" | "recipes" | "ingredients" | "suppliers" | "generic";
}) {
  const reviewCount = rows.filter(
    (r) =>
      r.status.toLowerCase().includes("risk") ||
      r.status.toLowerCase().includes("review") ||
      r.status.toLowerCase().includes("high")
  ).length;

  return (
    <VyronCostAiShell title={title} subtitle={subtitle}>
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Records</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{rows.length}</div>
          <div className="mt-2 text-sm font-bold text-emerald-600">Live data</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Review Items</div>
          <div className="mt-3 text-4xl font-black text-red-600">{reviewCount}</div>
          <div className="mt-2 text-sm font-bold text-slate-500">Needs attention</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Drilldowns</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{rows.length}</div>
          <div className="mt-2 text-sm font-bold text-slate-500">Click any row</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Status</div>
          <div className="mt-3 text-4xl font-black text-emerald-600">Live</div>
          <div className="mt-2 text-sm font-bold text-slate-500">Supabase first</div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">
            {type === "products"
              ? "Product Register"
              : type === "recipes"
                ? "Recipe Register"
                : type === "ingredients"
                  ? "Ingredient Register"
                  : type === "suppliers"
                    ? "Supplier Register"
                    : "Live Drilldown"}
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-5 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <div>Name</div>
            <div>Category</div>
            <div>Metric</div>
            <div>Status</div>
            <div>Impact</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-8 text-sm font-bold text-slate-500">No records loaded yet.</div>
          ) : (
            rows.map((row) => {
              const href =
                type === "generic" ? "/dashboard" : detailHref(type, row.id);

              return (
                <Link
                  key={row.id}
                  href={href}
                  className="grid grid-cols-5 border-t border-slate-100 px-5 py-4 text-sm transition hover:bg-violet-50"
                >
                  <div className="font-black text-slate-900">{row.name}</div>
                  <div className="font-bold text-slate-500">{row.category || "—"}</div>
                  <div className="font-black text-violet-700">{row.metric}</div>
                  <div className="font-bold text-slate-600">{row.status}</div>
                  <div className="font-black text-slate-900">{row.impact}</div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
