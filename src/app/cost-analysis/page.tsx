import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getHandcraftedProductCostLines } from "@/lib/handcrafted-tenant";
import { getLeakageKpis } from "@/lib/vyron-financial-command-data";
import { formatMoney } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";
import { getWorkspaceCompanyId, shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";

type CostCategory = {
  name: string;
  value: number;
  href: string;
};

async function getCostCategories(): Promise<CostCategory[]> {
  const useDemo = await shouldUseWorkspaceDemoData();
  const lines = useDemo ? getHandcraftedProductCostLines() : [];

  if (lines.length) {
    const buckets: Record<string, number> = {};
    for (const line of lines) {
      const key = String(line.line_type || "Other");
      buckets[key] = (buckets[key] || 0) + Number(line.line_cost || line.line_cost_imported || 0);
    }
    return Object.entries(buckets)
      .map(([name, value]) => ({
        name,
        value,
        href:
          /ingredient/i.test(name)
            ? "/ingredients"
            : /pack/i.test(name)
              ? "/procurement-risk"
              : "/products",
      }))
      .sort((a, b) => b.value - a.value);
  }

  if (supabase) {
    const companyId = await getWorkspaceCompanyId();
    if (!companyId) return [];
    const { data } = await supabase
      .from("vyron_cost_product_cost_lines")
      .select("line_type, line_cost, line_cost_imported")
      .eq("company_id", companyId)
      .limit(5000);

    if (data?.length) {
      const buckets: Record<string, number> = {};
      for (const row of data) {
        const key = String((row as { line_type?: string }).line_type || "Other");
        const cost = Number((row as { line_cost?: number; line_cost_imported?: number }).line_cost || (row as { line_cost_imported?: number }).line_cost_imported || 0);
        buckets[key] = (buckets[key] || 0) + cost;
      }
      return Object.entries(buckets)
        .map(([name, value]) => ({ name, value, href: "/products" }))
        .sort((a, b) => b.value - a.value);
    }
  }

  const kpis = await getLeakageKpis();
  return [
    { name: "Food Cost", value: kpis.productsBelowGp * 12, href: "/products" },
    { name: "Packaging", value: kpis.procurementAnomalies * 12, href: "/procurement-risk" },
    { name: "Wastage", value: kpis.wastageLosses * 12, href: "/financial-leakage" },
    { name: "Leakage", value: kpis.estimatedAnnualLeakage, href: "/financial-leakage" },
  ];
}

export default async function CostAnalysisPage() {
  const categories = await getCostCategories();
  const total = categories.reduce((sum, item) => sum + item.value, 0);

  return (
    <VyronCostAiShell hidePageHeader title="Cost Analysis" subtitle="Food cost, packaging, labour, wastage and leakage breakdown.">
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Categories</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{categories.length}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Total Analysed</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{formatMoney(total)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Largest Driver</div>
          <div className="mt-3 text-2xl font-black text-slate-900">{categories[0]?.name || "—"}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Drilldown</div>
          <div className="mt-3 text-4xl font-black text-[#84CC16]">Live</div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="mb-5 text-xl font-black text-slate-900">Cost categories</h2>
        <div className="space-y-3">
          {categories.map((category) => {
            const width = total > 0 ? Math.max(8, Math.round((category.value / total) * 100)) : 0;
            return (
              <Link key={category.name} href={category.href} className="block rounded-2xl border border-slate-100 p-4 transition hover:bg-violet-50">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-black text-slate-900">{category.name}</div>
                  <div className="font-black text-violet-700">{formatMoney(category.value)}</div>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${width}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
